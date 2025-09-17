const crypto = require('crypto');
const path = require('path');
const { Op } = require('sequelize');

const { FinanceEntry, FinanceCategory } = require('../../database/models');

const stripDiacritics = (value) => {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

const normalizeWhitespace = (value) => value.replace(/\s+/g, ' ').trim();

const sanitizeDescription = (value) => {
    if (value === null || value === undefined) {
        return '';
    }
    return normalizeWhitespace(String(value));
};

const normalizeStatus = (value) => {
    const allowed = new Set(['pending', 'paid', 'overdue', 'cancelled']);
    if (!value) {
        return 'pending';
    }
    const normalized = String(value).trim().toLowerCase();
    return allowed.has(normalized) ? normalized : 'pending';
};

const normalizeAmount = (value) => {
    if (value === null || value === undefined || value === '') {
        throw new Error('Valor não informado.');
    }

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new Error('Valor inválido.');
        }
        return Number(value.toFixed(2));
    }

    const stringValue = String(value).trim();
    if (!stringValue) {
        throw new Error('Valor inválido.');
    }

    let sanitized = stringValue.replace(/[^0-9,.-]/g, '');
    if (!sanitized) {
        throw new Error('Valor inválido.');
    }

    const lastComma = sanitized.lastIndexOf(',');
    const lastDot = sanitized.lastIndexOf('.');

    if (lastComma > -1 && lastComma > lastDot) {
        sanitized = sanitized.replace(/\./g, '').replace(',', '.');
    } else if (sanitized.indexOf(',') > -1 && lastComma === lastDot) {
        sanitized = sanitized.replace(',', '.');
    } else {
        sanitized = sanitized.replace(/,/g, '');
    }

    const parsed = Number.parseFloat(sanitized);
    if (!Number.isFinite(parsed)) {
        throw new Error('Valor inválido.');
    }

    return Number(parsed.toFixed(2));
};

const formatISODate = (year, month, day) => {
    const normalizedYear = String(year).padStart(4, '0');
    const normalizedMonth = String(month).padStart(2, '0');
    const normalizedDay = String(day).padStart(2, '0');
    return `${normalizedYear}-${normalizedMonth}-${normalizedDay}`;
};

const normalizeDate = (value, fieldName = 'data') => {
    if (!value) {
        throw new Error(`${fieldName} não informada.`);
    }

    if (value instanceof Date) {
        if (!Number.isFinite(value.getTime())) {
            throw new Error(`${fieldName} inválida.`);
        }
        return formatISODate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
    }

    const stringValue = String(value).trim();
    if (!stringValue) {
        throw new Error(`${fieldName} inválida.`);
    }

    const isoDateMatch = stringValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDateMatch) {
        return formatISODate(isoDateMatch[1], isoDateMatch[2], isoDateMatch[3]);
    }

    const dateTimeMatch = stringValue.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]/);
    if (dateTimeMatch) {
        return formatISODate(dateTimeMatch[1], dateTimeMatch[2], dateTimeMatch[3]);
    }

    const brDateMatch = stringValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (brDateMatch) {
        return formatISODate(brDateMatch[3], brDateMatch[2], brDateMatch[1]);
    }

    const compactMatch = stringValue.match(/^(\d{4})(\d{2})(\d{2})/);
    if (compactMatch) {
        return formatISODate(compactMatch[1], compactMatch[2], compactMatch[3]);
    }

    const parsedDate = new Date(stringValue);
    if (!Number.isFinite(parsedDate.getTime())) {
        throw new Error(`${fieldName} inválida.`);
    }

    return formatISODate(
        parsedDate.getUTCFullYear(),
        parsedDate.getUTCMonth() + 1,
        parsedDate.getUTCDate()
    );
};

const inferType = (rawType, amount) => {
    if (rawType) {
        const normalized = stripDiacritics(String(rawType)).toLowerCase();
        if (/(payable|despesa|debito|pagamento|saida|debit|debitado)/.test(normalized)) {
            return 'payable';
        }
        if (/(receivable|receita|credito|entrada|credit|deposito|deposit)/.test(normalized)) {
            return 'receivable';
        }
    }

    if (typeof amount === 'number') {
        if (amount < 0) {
            return 'payable';
        }
        if (amount > 0) {
            return 'receivable';
        }
    }

    return 'payable';
};

const createEntryHash = (entry) => {
    const description = sanitizeDescription(entry.description || '');
    const amount = normalizeAmount(entry.value ?? entry.amount ?? 0);
    const dueDate = normalizeDate(entry.dueDate || entry.date || entry.paymentDate || entry.data, 'data');

    const payload = `${description.toLowerCase()}|${amount.toFixed(2)}|${dueDate}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
};

const detectDelimiter = (headerLine) => {
    const candidates = [',', ';', '\t', '|'];
    const best = candidates.map((delimiter) => ({ delimiter, count: headerLine.split(delimiter).length }))
        .sort((a, b) => b.count - a.count)[0];
    return (best && best.count > 1) ? best.delimiter : ',';
};

const splitCsvLine = (line, delimiter) => {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === delimiter && !inQuotes) {
            values.push(current.trim());
            current = '';
            continue;
        }

        current += char;
    }

    values.push(current.trim());
    return values;
};

const fallbackSlugify = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    const stringValue = sanitizeDescription(value);
    if (!stringValue) {
        return null;
    }

    const normalized = stripDiacritics(stringValue)
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    return normalized || null;
};

const normalizeCategorySlug = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    const source = sanitizeDescription(value);
    if (!source) {
        return null;
    }

    if (FinanceCategory && typeof FinanceCategory.normalizeSlug === 'function') {
        try {
            return FinanceCategory.normalizeSlug(source);
        } catch (error) {
            return fallbackSlugify(source);
        }
    }

    return fallbackSlugify(source);
};

const extractCategorySlugFromInput = (input) => {
    if (!input || typeof input !== 'object') {
        return null;
    }

    const candidates = [
        input.financeCategorySlug,
        input.categorySlug,
        input.categoryKey,
        input.category,
        input.financeCategory,
        input.categoryName,
        input.metadata?.originalCategory,
        input.metadata?.category,
        input.metadata?.categoryName
    ];

    for (const candidate of candidates) {
        const slug = normalizeCategorySlug(candidate);
        if (slug) {
            return slug;
        }
    }

    return null;
};

const buildCategoryResolver = async ({ ownerId, FinanceCategoryModel = FinanceCategory } = {}) => {
    if (!FinanceCategoryModel || !ownerId) {
        return {
            resolveSlug: async () => null,
            isAllowedId: () => false
        };
    }

    const categories = await FinanceCategoryModel.scope('all').findAll({
        where: { ownerId },
        attributes: ['id', 'name', 'slug']
    });

    const slugMap = new Map();
    const allowedIds = new Set();

    categories.forEach((record) => {
        const plain = typeof record.get === 'function' ? record.get({ plain: true }) : record;
        const slug = normalizeCategorySlug(plain.slug || plain.name);
        if (slug && !slugMap.has(slug)) {
            slugMap.set(slug, plain.id);
        }
        if (plain.id !== undefined && plain.id !== null) {
            allowedIds.add(Number(plain.id));
        }
    });

    return {
        resolveSlug: async (slug) => {
            if (!slug) {
                return null;
            }
            return slugMap.get(slug) || null;
        },
        isAllowedId: (id) => {
            if (id === undefined || id === null) {
                return true;
            }
            const numeric = Number(id);
            if (!Number.isInteger(numeric)) {
                return false;
            }
            return allowedIds.has(numeric);
        }
    };
};

const aliasMap = {
    description: ['description', 'descricao', 'descrição', 'historico', 'histórico', 'memo', 'name', 'history'],
    type: ['type', 'tipo', 'natureza', 'transactiontype', 'trntype'],
    category: ['category', 'categoria', 'financecategory'],
    value: ['value', 'valor', 'amount', 'quantia', 'montante'],
    dueDate: ['duedate', 'data', 'date', 'datavencimento', 'vencimento', 'posteddate', 'dtposted'],
    paymentDate: ['paymentdate', 'datapagamento', 'payment_date', 'data_pagamento', 'dtpayment'],
    status: ['status', 'situacao', 'situação']
};

const normalizeHeader = (header) => {
    return stripDiacritics(header).toLowerCase().replace(/[^a-z0-9]/g, '');
};

const resolveHeaderIndexes = (headers) => {
    const normalizedHeaders = headers.map((header) => normalizeHeader(header));
    const indexMap = {};

    Object.entries(aliasMap).forEach(([key, aliases]) => {
        const normalizedAliases = aliases.map(normalizeHeader);
        const foundIndex = normalizedAliases.map((alias) => normalizedHeaders.indexOf(alias)).find((index) => index !== -1);
        if (foundIndex !== undefined && foundIndex !== -1) {
            indexMap[key] = foundIndex;
        }
    });

    return indexMap;
};

const parseCsvContent = (content) => {
    const warnings = [];
    const sanitized = content.replace(/\uFEFF/g, '').replace(/\r\n/g, '\n');
    const lines = sanitized.split(/\n+/).map((line) => line.trim()).filter((line) => line);

    if (!lines.length) {
        return { entries: [], warnings: ['Arquivo CSV sem linhas válidas.'] };
    }

    const delimiter = detectDelimiter(lines[0]);
    const headers = splitCsvLine(lines[0], delimiter);
    const headerIndexes = resolveHeaderIndexes(headers);

    const requiredColumns = ['description', 'value', 'dueDate'];
    const missingColumns = requiredColumns.filter((column) => !(column in headerIndexes));

    if (missingColumns.length) {
        const missingList = missingColumns.join(', ');
        throw new Error(`Colunas obrigatórias ausentes no CSV: ${missingList}.`);
    }

    const entries = [];

    for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        if (!line) {
            continue;
        }

        const values = splitCsvLine(line, delimiter);
        if (!values.length) {
            continue;
        }

        try {
            const description = sanitizeDescription(values[headerIndexes.description] || '');
            const amountRaw = values[headerIndexes.value];
            const numericAmount = normalizeAmount(amountRaw);
            const dueDate = normalizeDate(values[headerIndexes.dueDate], 'data');
            const paymentDate = headerIndexes.paymentDate !== undefined && values[headerIndexes.paymentDate]
                ? normalizeDate(values[headerIndexes.paymentDate], 'data de pagamento')
                : null;
            const typeRaw = headerIndexes.type !== undefined ? values[headerIndexes.type] : null;
            const categoryRaw = headerIndexes.category !== undefined ? values[headerIndexes.category] : null;
            const statusRaw = headerIndexes.status !== undefined ? values[headerIndexes.status] : null;
            const type = inferType(typeRaw, numericAmount);
            const categorySlug = normalizeCategorySlug(categoryRaw);

            entries.push({
                description,
                type,
                value: Math.abs(numericAmount),
                dueDate,
                paymentDate,
                status: normalizeStatus(statusRaw),
                metadata: {
                    source: 'csv',
                    line: lineIndex + 1,
                    originalType: typeRaw || null,
                    rawAmount: amountRaw,
                    originalCategory: sanitizeDescription(categoryRaw) || null,
                    categorySlug
                },
                financeCategorySlug: categorySlug || null
            });
        } catch (error) {
            warnings.push(`Linha ${lineIndex + 1}: ${error.message}`);
        }
    }

    return { entries, warnings };
};

const extractTagValue = (block, tag) => {
    if (!block) {
        return null;
    }

    const normalizedBlock = String(block);
    const searchBlock = normalizedBlock.toUpperCase();
    const openTag = `<${tag}>`.toUpperCase();
    const startIndex = searchBlock.indexOf(openTag);

    if (startIndex === -1) {
        return null;
    }

    const valueStart = startIndex + openTag.length;
    let valueEnd = searchBlock.indexOf('<', valueStart);

    if (valueEnd === -1) {
        valueEnd = normalizedBlock.length;
    }

    const rawValue = normalizedBlock.slice(valueStart, valueEnd);
    return rawValue.trim();
};

const parseOfxContent = (content) => {
    const warnings = [];
    const sanitized = content.replace(/\r\n/g, '\n');
    const segments = sanitized.split(/<STMTTRN>/i).slice(1);
    const entries = [];

    segments.forEach((segment, index) => {
        const block = segment.split(/<\/STMTTRN>/i)[0];
        if (!block) {
            return;
        }

        try {
            const amountRaw = extractTagValue(block, 'TRNAMT');
            const dateRaw = extractTagValue(block, 'DTUSER') || extractTagValue(block, 'DTPOSTED');
            if (!amountRaw || !dateRaw) {
                throw new Error('Registro incompleto.');
            }

            const numericAmount = normalizeAmount(amountRaw);
            const dueDate = normalizeDate(dateRaw, 'data');
            const typeRaw = extractTagValue(block, 'TRNTYPE');
            const descriptionRaw = extractTagValue(block, 'MEMO') || extractTagValue(block, 'NAME') || `Transação ${index + 1}`;
            const statusRaw = extractTagValue(block, 'STATUS');
            const paymentDateRaw = extractTagValue(block, 'DTAVAIL') || null;
            const categoryRaw = extractTagValue(block, 'CATEGORY');
            const categorySlug = normalizeCategorySlug(categoryRaw);

            entries.push({
                description: sanitizeDescription(descriptionRaw),
                type: inferType(typeRaw, numericAmount),
                value: Math.abs(numericAmount),
                dueDate,
                paymentDate: paymentDateRaw ? normalizeDate(paymentDateRaw, 'data de pagamento') : null,
                status: normalizeStatus(statusRaw),
                metadata: {
                    source: 'ofx',
                    index: index + 1,
                    originalType: typeRaw || null,
                    rawAmount: amountRaw,
                    originalCategory: sanitizeDescription(categoryRaw) || null,
                    categorySlug
                },
                financeCategorySlug: categorySlug || null
            });
        } catch (error) {
            warnings.push(`Transação ${index + 1}: ${error.message}`);
        }
    });

    return { entries, warnings };
};

const parseFinanceFile = (buffer, { filename = '', mimetype = '' } = {}) => {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error('Arquivo vazio ou inválido.');
    }

    const extension = path.extname(filename).toLowerCase();
    const normalizedMimetype = mimetype.toLowerCase();
    const content = buffer.toString('utf8');

    if (extension === '.ofx' || normalizedMimetype.includes('ofx') || /<OFX>/i.test(content)) {
        return parseOfxContent(content);
    }

    return parseCsvContent(content);
};

const prepareEntryForPersistence = async (input, options = {}) => {
    if (!input) {
        throw new Error('Entrada inválida.');
    }

    const description = sanitizeDescription(input.description || '');
    if (!description) {
        throw new Error('Descrição é obrigatória.');
    }

    const numericAmount = normalizeAmount(input.value);
    const type = inferType(input.type, numericAmount);
    const dueDate = normalizeDate(input.dueDate, 'data de vencimento');
    const paymentDate = input.paymentDate ? normalizeDate(input.paymentDate, 'data de pagamento') : null;
    const status = normalizeStatus(input.status);
    const categoryResolver = options.categoryResolver;

    const rawCategoryId = input.financeCategoryId ?? input.categoryId ?? null;
    const categorySlug = extractCategorySlugFromInput(input);

    let financeCategoryId = null;

    if (rawCategoryId !== null && rawCategoryId !== undefined) {
        const numericId = Number(rawCategoryId);
        if (!Number.isInteger(numericId)) {
            throw new Error('Categoria informada é inválida.');
        }
        if (!categoryResolver || typeof categoryResolver.isAllowedId !== 'function' || !categoryResolver.isAllowedId(numericId)) {
            throw new Error('Categoria informada não pertence ao usuário autenticado.');
        }
        financeCategoryId = numericId;
    } else if (categorySlug) {
        if (!categoryResolver || typeof categoryResolver.resolveSlug !== 'function') {
            throw new Error('Categoria informada não pôde ser validada.');
        }
        const resolvedId = await categoryResolver.resolveSlug(categorySlug);
        if (!resolvedId) {
            throw new Error('Categoria informada não encontrada para o usuário autenticado.');
        }
        financeCategoryId = resolvedId;
    }

    return {
        description,
        type,
        value: Math.abs(numericAmount),
        dueDate,
        paymentDate,
        status,
        financeCategoryId,
        hash: createEntryHash({ description, value: Math.abs(numericAmount), dueDate })
    };
};

const cloneMetadata = (rawMetadata) => {
    if (!rawMetadata || typeof rawMetadata !== 'object') {
        return {};
    }

    return { ...rawMetadata };
};

const buildInvalidPreviewEntry = (rawEntry, metadata, errorMessage) => {
    let normalizedAmount = 0;
    try {
        normalizedAmount = Math.abs(normalizeAmount(rawEntry?.value ?? rawEntry?.amount ?? 0));
    } catch (err) {
        normalizedAmount = 0;
    }

    let normalizedDueDate = null;
    const dueDateInput = rawEntry?.dueDate || rawEntry?.date || rawEntry?.paymentDate || rawEntry?.data;
    if (dueDateInput) {
        try {
            normalizedDueDate = normalizeDate(dueDateInput, 'data');
        } catch (err) {
            normalizedDueDate = null;
        }
    }

    let normalizedPaymentDate = null;
    if (rawEntry?.paymentDate) {
        try {
            normalizedPaymentDate = normalizeDate(rawEntry.paymentDate, 'data de pagamento');
        } catch (err) {
            normalizedPaymentDate = null;
        }
    }

    return {
        description: sanitizeDescription(rawEntry?.description || ''),
        type: (() => {
            try {
                return inferType(rawEntry?.type, normalizedAmount || rawEntry?.value || rawEntry?.amount);
            } catch (err) {
                return 'payable';
            }
        })(),
        value: normalizedAmount,
        dueDate: normalizedDueDate,
        paymentDate: normalizedPaymentDate,
        status: normalizeStatus(rawEntry?.status),
        financeCategoryId: null,
        metadata,
        financeCategorySlug: metadata?.categorySlug || null,
        hash: null,
        conflict: true,
        include: false,
        conflictReasons: errorMessage ? [errorMessage] : ['Entrada inválida.']
    };
};

const createFinanceCategoryResolver = async (options = {}) => buildCategoryResolver(options);

const buildImportPreview = async (rawEntries = [], options = {}) => {
    const entriesArray = Array.isArray(rawEntries) ? rawEntries : [];

    let categoryResolver = options.categoryResolver || null;
    if (!categoryResolver) {
        categoryResolver = await buildCategoryResolver({
            ownerId: options.ownerId,
            FinanceCategoryModel: options.FinanceCategoryModel || FinanceCategory
        });
    }

    const previewEntries = await Promise.all(entriesArray.map(async (rawEntry) => {
        const metadata = cloneMetadata(rawEntry?.metadata);
        metadata.originalCategory = metadata.originalCategory || sanitizeDescription(rawEntry?.category || rawEntry?.financeCategory || rawEntry?.financeCategorySlug) || null;
        metadata.categorySlug = metadata.categorySlug || extractCategorySlugFromInput(rawEntry);

        try {
            const prepared = await prepareEntryForPersistence(rawEntry, { categoryResolver });
            return {
                ...prepared,
                financeCategorySlug: metadata.categorySlug || null,
                metadata,
                conflict: false,
                include: true,
                conflictReasons: []
            };
        } catch (error) {
            return buildInvalidPreviewEntry(rawEntry, metadata, error.message);
        }
    }));

    const validEntries = previewEntries.filter((entry) => entry.hash);
    const dueDates = [...new Set(validEntries.map((entry) => entry.dueDate).filter(Boolean))];

    let existingEntries = [];
    if (dueDates.length) {
        existingEntries = await FinanceEntry.findAll({
            where: { dueDate: { [Op.in]: dueDates } },
            attributes: ['id', 'description', 'value', 'dueDate']
        });
    }

    const existingHashes = new Map();
    existingEntries.forEach((record) => {
        const plain = typeof record.get === 'function' ? record.get({ plain: true }) : record;
        const hash = createEntryHash(plain);
        if (!existingHashes.has(hash)) {
            existingHashes.set(hash, plain);
        }
    });

    const seenHashes = new Set();
    validEntries.forEach((entry) => {
        if (seenHashes.has(entry.hash)) {
            entry.conflict = true;
            entry.conflictReasons.push('Duplicado no arquivo importado.');
        } else {
            seenHashes.add(entry.hash);
        }

        if (existingHashes.has(entry.hash)) {
            const existing = existingHashes.get(entry.hash);
            const reason = existing && existing.id
                ? `Já existe lançamento #${existing.id} com os mesmos dados.`
                : 'Já existe lançamento com os mesmos dados.';
            entry.conflict = true;
            entry.conflictReasons.push(reason);
        }

        entry.include = !entry.conflict;
    });

    previewEntries.forEach((entry) => {
        if (!Array.isArray(entry.conflictReasons)) {
            entry.conflictReasons = [];
        } else {
            entry.conflictReasons = [...new Set(entry.conflictReasons.filter(Boolean))];
        }

        if (entry.conflict && entry.include) {
            entry.include = false;
        }
    });

    const totals = {
        total: previewEntries.length,
        conflicting: previewEntries.filter((entry) => entry.conflict).length
    };
    totals.new = Math.max(0, totals.total - totals.conflicting);

    return {
        entries: previewEntries,
        totals
    };
};

module.exports = {
    parseFinanceFile,
    parseCsvContent,
    parseOfxContent,
    sanitizeDescription,
    normalizeAmount,
    normalizeDate,
    inferType,
    normalizeStatus,
    createEntryHash,
    prepareEntryForPersistence,
    buildImportPreview,
    createFinanceCategoryResolver
};
