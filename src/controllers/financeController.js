const { Op } = require('sequelize');
const { FinanceEntry, FinanceAttachment, FinanceCategory, FinanceGoal, sequelize } = require('../../database/models');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { pipeline } = require('stream/promises');
const financeReportingService = require('../services/financeReportingService');
const reportChartService = require('../services/reportChartService');
const financeImportService = require('../services/financeImportService');
const { buildImportPreview } = financeImportService;
const fileStorageService = require('../services/fileStorageService');

const { utils: reportingUtils, constants: financeConstants } = financeReportingService;
const {
    FINANCE_TYPES,
    FINANCE_STATUSES,
    FINANCE_RECURRING_INTERVALS
} = financeConstants;
const { normalizeRecurringInterval } = reportingUtils;

const wantsJsonResponse = (req = {}) => {
    if (!req || typeof req !== 'object') {
        return false;
    }

    if (req.xhr) {
        return true;
    }

    const getHeader = (name) => {
        if (typeof req.get === 'function') {
            const value = req.get(name);
            if (value) {
                return value;
            }
        }
        const headers = req.headers || {};
        const key = Object.keys(headers).find((header) => header.toLowerCase() === name.toLowerCase());
        return key ? headers[key] : undefined;
    };

    const requestedWith = getHeader('X-Requested-With');
    if (typeof requestedWith === 'string' && requestedWith.toLowerCase() === 'xmlhttprequest') {
        return true;
    }

    const acceptHeader = getHeader('Accept');
    const checkAccept = (value) => {
        if (typeof value === 'string') {
            const normalized = value.toLowerCase();
            return normalized.includes('application/json')
                || normalized.includes('text/json')
                || normalized.includes('+json');
        }
        if (Array.isArray(value)) {
            return value.some((item) => typeof item === 'string' && checkAccept(item));
        }
        return false;
    };

    if (checkAccept(acceptHeader)) {
        return true;
    }

    const contentType = getHeader('Content-Type');
    if (typeof contentType === 'string' && contentType.toLowerCase().includes('application/json')) {
        return true;
    }

    const query = req.query || {};
    if (query.format === 'json' || query.format === 'JSON') {
        return true;
    }

    if (query.ajax === '1' || query.ajax === 1 || query.ajax === true) {
        return true;
    }

    return false;
};

const recurringIntervalOptions = FINANCE_RECURRING_INTERVALS.map((interval) => ({
    value: interval.value,
    label: interval.label
}));

const parseAmount = (value) => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeAmountInput = (value) => {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
        let cleaned = value.trim();
        if (!cleaned) {
            return null;
        }

        if (cleaned.includes('.') && cleaned.includes(',')) {
            cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else if (cleaned.includes(',')) {
            cleaned = cleaned.replace(',', '.');
        }

        const parsed = Number.parseFloat(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
});

const formatCurrency = (value) => currencyFormatter.format(parseAmount(value));

const toExcelColor = (hexColor, fallback = 'FF2563EB') => {
    if (typeof hexColor !== 'string' || !hexColor) {
        return fallback;
    }
    let normalized = hexColor.trim();
    if (normalized.startsWith('#')) {
        normalized = normalized.slice(1);
    }
    if (normalized.length === 3) {
        normalized = normalized.split('').map((char) => char + char).join('');
    }
    if (normalized.length !== 6) {
        return fallback;
    }
    return `FF${normalized.toUpperCase()}`;
};

const sanitizeText = (value) => {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value).replace(/\s+/g, ' ').trim();
};

const formatDateLabel = (value) => {
    if (!value) {
        return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) {
        return null;
    }
    return date.toLocaleDateString('pt-BR');
};

const formatPeriodLabel = (filters = {}) => {
    const start = formatDateLabel(filters.startDate);
    const end = formatDateLabel(filters.endDate);

    if (start && end) {
        return `${start} a ${end}`;
    }
    if (start) {
        return `A partir de ${start}`;
    }
    if (end) {
        return `Até ${end}`;
    }
    return 'Todo o período';
};

const wantsJsonResponse = (req) => {
    if (!req) {
        return false;
    }

    if (req.xhr === true) {
        return true;
    }

    const headers = req.headers || {};
    const acceptHeader = headers.accept || headers.Accept || '';
    if (typeof acceptHeader === 'string' && acceptHeader.includes('application/json')) {
        return true;
    }

    const requestedWith = headers['x-requested-with'] || headers['X-Requested-With'];
    if (typeof requestedWith === 'string' && requestedWith.toLowerCase() === 'xmlhttprequest') {
        return true;
    }

    if (req.query && typeof req.query.format === 'string' && req.query.format.toLowerCase() === 'json') {
        return true;
    }

    return false;
};

const isMissingTableDbError = (error, tableName) => {
    if (!error) {
        return false;
    }

    const message = String(
        error?.original?.message
        || error?.parent?.message
        || error?.message
        || ''
    ).toLowerCase();

    return message.includes('no such table') && message.includes(String(tableName).toLowerCase());
};

const buildImportPreview = async (rawEntries = []) => {
    const totals = { total: 0, new: 0, conflicting: 0, invalid: 0 };
    if (!Array.isArray(rawEntries) || !rawEntries.length) {
        return { entries: [], totals, validationErrors: [] };
    }

    const normalizedEntries = [];
    const validationErrors = [];

    rawEntries.forEach((entry, index) => {
        try {
            const prepared = financeImportService.prepareEntryForPersistence(entry);
            normalizedEntries.push({ ...prepared, originalIndex: index });
        } catch (error) {
            validationErrors.push({ index, message: error.message || 'Entrada inválida.' });
        }
    });

    totals.total = normalizedEntries.length + validationErrors.length;
    totals.invalid = validationErrors.length;

    const dueDates = [...new Set(normalizedEntries.map((item) => item.dueDate))];
    let existingEntries = [];
    if (dueDates.length) {
        existingEntries = await FinanceEntry.findAll({
            where: {
                dueDate: { [Op.in]: dueDates }
            },
            attributes: ['description', 'value', 'dueDate'],
            raw: true
        });
    }

    const existingHashes = new Set(
        existingEntries.map((entry) => financeImportService.createEntryHash(entry))
    );

    const seenHashes = new Set();
    const previewEntries = normalizedEntries.map((item) => {
        const conflictWithDatabase = existingHashes.has(item.hash);
        const duplicateInBatch = seenHashes.has(item.hash);
        seenHashes.add(item.hash);

        const conflict = conflictWithDatabase || duplicateInBatch;
        if (conflict) {
            totals.conflicting += 1;
        } else {
            totals.new += 1;
        }

        return {
            description: item.description,
            type: item.type,
            value: item.value,
            dueDate: item.dueDate,
            paymentDate: item.paymentDate,
            status: item.status,
            hash: item.hash,
            conflict,
            duplicate: duplicateInBatch
        };
    });

    return {
        entries: previewEntries,
        totals,
        validationErrors
    };
};

const normalizeFilterValue = (value) => {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed.toLowerCase() : null;
};

const buildFiltersFromQuery = (query = {}) => {
    const filters = {};

    if (reportingUtils.isValidISODate(query.startDate)) {
        filters.startDate = query.startDate;
    }

    if (reportingUtils.isValidISODate(query.endDate)) {
        filters.endDate = query.endDate;
    }

    const typeFilter = normalizeFilterValue(query.type);
    if (typeFilter && FINANCE_TYPES.includes(typeFilter)) {
        filters.type = typeFilter;
    }

    const statusFilter = normalizeFilterValue(query.status);
    if (statusFilter && FINANCE_STATUSES.includes(statusFilter)) {
        filters.status = statusFilter;
    }

    return filters;
};

const buildEntriesQueryOptions = (filters = {}) => {
    const options = {
        include: [
            {
                model: FinanceAttachment,
                as: 'attachments',
                attributes: ['id', 'fileName', 'mimeType', 'size', 'createdAt']
            },
            {
                model: FinanceCategory,
                as: 'category',
                attributes: ['id', 'name', 'slug', 'color'],
                required: false
            }
        ],
        order: [
            ['dueDate', 'ASC'],
            ['id', 'ASC'],
            [{ model: FinanceAttachment, as: 'attachments' }, 'createdAt', 'DESC']
        ]
    };

    const where = {};

    const dateFilter = reportingUtils.buildDateFilter(filters);
    if (dateFilter) {
        where.dueDate = dateFilter;
    }

    if (filters.type && FINANCE_TYPES.includes(filters.type)) {
        where.type = filters.type;
    }

    if (filters.status && FINANCE_STATUSES.includes(filters.status)) {
        where.status = filters.status;
    }

    if (Object.keys(where).length > 0) {
        options.where = where;
    }

    return options;
};

const createSummaryPromise = (entriesPromise, filters) => {
    return entriesPromise.then(async (entries) => {
        try {
            return await financeReportingService.getFinanceSummary(filters, { entries });
        } catch (error) {
            if (process.env.NODE_ENV !== 'test') {
                console.error('Erro ao calcular resumo financeiro:', error);
            }
            const statusSummary = reportingUtils.buildStatusSummaryFromEntries(entries);
            const monthlySummary = reportingUtils.buildMonthlySummaryFromEntries(entries);
            const totals = reportingUtils.buildTotalsFromStatus(statusSummary);
            return {
                projections: [],
                statusSummary,
                monthlySummary,
                totals
            };
        }
    });
};

const parseMonthInput = (value) => {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value : null;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const byNumber = new Date(value);
        return Number.isFinite(byNumber.getTime()) ? byNumber : null;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }

        if (/^\d{4}-\d{2}$/.test(trimmed)) {
            const date = new Date(`${trimmed}-01T00:00:00Z`);
            return Number.isFinite(date.getTime()) ? date : null;
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            const date = new Date(`${trimmed}T00:00:00Z`);
            return Number.isFinite(date.getTime()) ? date : null;
        }

        const parsed = new Date(trimmed);
        return Number.isFinite(parsed.getTime()) ? parsed : null;
    }

    return null;
};

const normalizeGoalMonth = (value) => {
    if (typeof FinanceGoal?.normalizeMonthValue === 'function') {
        return FinanceGoal.normalizeMonthValue(value);
    }

    const parsed = parseMonthInput(value);
    if (!parsed) {
        return null;
    }

    const normalized = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
    return normalized.toISOString().slice(0, 10);
};

const formatGoalMonthKey = (value) => {
    const parsed = parseMonthInput(value);
    if (!parsed) {
        return '';
    }
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`;
};

const formatGoalMonthLabel = (value) => {
    const parsed = parseMonthInput(value);
    if (!parsed) {
        return '--';
    }
    return parsed.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

const serializeGoalForView = (goal) => {
    const plain = typeof goal?.get === 'function' ? goal.get({ plain: true }) : goal || {};
    const amountNumber = parseAmount(plain.targetNetAmount);
    const monthKey = formatGoalMonthKey(plain.month);

    return {
        id: plain.id,
        month: plain.month,
        monthKey,
        monthLabel: formatGoalMonthLabel(plain.month),
        targetNetAmount: amountNumber,
        targetNetAmountInput: Number.isFinite(amountNumber) ? amountNumber.toFixed(2) : '0.00',
        formattedAmount: formatCurrency(amountNumber),
        notes: plain.notes || ''
    };
};

const loadFinanceGoals = async () => {
    if (!FinanceGoal || typeof FinanceGoal.findAll !== 'function') {
        return [];
    }

    try {
        return await FinanceGoal.findAll({
            order: [['month', 'ASC']]
        });
    } catch (error) {
        if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
            console.warn('Não foi possível carregar metas financeiras:', error);
        }
        return [];
    }
};

const filterValidStorageKeys = (storageKeys = []) => {
    if (!Array.isArray(storageKeys)) {
        return [];
    }

    return storageKeys
        .map((key) => (typeof key === 'string' ? key.trim() : ''))
        .filter((key) => Boolean(key));
};

async function removeStoredFiles(storageKeys = []) {
    const validKeys = filterValidStorageKeys(storageKeys);
    if (!validKeys.length) {
        return;
    }

    const tasks = validKeys.map(async (storageKey) => {
        try {
            await fileStorageService.deleteStoredFile(storageKey);
        } catch (error) {
            console.error('Erro ao remover arquivo de armazenamento financeiro:', error);
        }
    });

    await Promise.allSettled(tasks);
}

async function persistAttachments(entryId, files = [], transaction) {
    if (!entryId || !Array.isArray(files) || !files.length) {
        return [];
    }

    const storedKeys = [];
    const attachmentPayload = [];

    try {
        for (const file of files) {
            if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
                continue;
            }

            const { storageKey, checksum, sanitizedFileName } = await fileStorageService.saveBuffer({
                buffer: file.buffer,
                originalName: file.originalname || file.originalName || 'anexo'
            });

            storedKeys.push(storageKey);

            const size = Number.isFinite(Number(file.size))
                ? Number(file.size)
                : file.buffer.length;

            attachmentPayload.push({
                financeEntryId: entryId,
                fileName: sanitizedFileName,
                mimeType: file.mimetype || 'application/octet-stream',
                size,
                checksum,
                storageKey
            });
        }

        if (!attachmentPayload.length) {
            return storedKeys;
        }

        const bulkCreateOptions = { validate: true };
        if (transaction) {
            bulkCreateOptions.transaction = transaction;
        }

        await FinanceAttachment.bulkCreate(attachmentPayload, bulkCreateOptions);

        return storedKeys;
    } catch (error) {
        await removeStoredFiles(storedKeys);
        throw error;
    }
}

const resolveSequelizeInstance = () => {
    if (sequelize && typeof sequelize.transaction === 'function') {
        return sequelize;
    }

    if (FinanceEntry?.sequelize && typeof FinanceEntry.sequelize.transaction === 'function') {
        return FinanceEntry.sequelize;
    }

    if (FinanceAttachment?.sequelize && typeof FinanceAttachment.sequelize.transaction === 'function') {
        return FinanceAttachment.sequelize;
    }

    return null;
};

const beginTransaction = async () => {
    const sequelizeInstance = resolveSequelizeInstance();
    if (!sequelizeInstance) {
        return null;
    }
    return sequelizeInstance.transaction();
};

module.exports = {
    listFinanceEntries: async (req, res) => {
        try {
            const filters = buildFiltersFromQuery(req.query);
            const entriesPromise = FinanceEntry.findAll(buildEntriesQueryOptions(filters));
            const summaryPromise = createSummaryPromise(entriesPromise, filters);
            const goalsPromise = (async () => {
                try {
                    return await FinanceGoal.findAll({
                        order: [['month', 'ASC']]
                    });
                } catch (error) {
                    if (isMissingTableDbError(error, 'FinanceGoals')) {
                        return [];
                    }
                    throw error;
                }
            })();
            const budgetOverviewPromise = financeReportingService.getBudgetSummaries(filters, {
                includeCategoryConsumption: true,
                entriesPromise
            });

            const [entries, summary, goals, budgetOverview] = await Promise.all([
                entriesPromise,
                summaryPromise,
                goalsPromise,
                budgetOverviewPromise
            ]);

            const budgetSummaries = Array.isArray(budgetOverview?.summaries)
                ? budgetOverview.summaries
                : [];
            const categoryConsumption = Array.isArray(budgetOverview?.categoryConsumption)
                ? budgetOverview.categoryConsumption
                : [];
            const budgetMonths = Array.isArray(budgetOverview?.months)
                ? budgetOverview.months
                : [];

            const projections = Array.isArray(summary.projections) ? summary.projections : [];
            const projectionHighlight = projections.find((item) => item.isFuture && item.hasGoal)
                || projections.find((item) => item.isFuture)
                || projections.find((item) => item.isCurrent)
                || null;
            const projectionAlerts = projections.filter((item) => item.needsAttention);
            const financeGoals = Array.isArray(goals) ? goals.map(serializeGoalForView) : [];

            const importPreview = req.session?.financeImportPreview || null;
            if (importPreview) {
                res.locals.importPreview = importPreview;
                req.session.financeImportPreview = null;
            }

            res.render(
                'finance/manageFinance',
                {
                    entries,
                    filters,
                    formatCurrency,
                    periodLabel: formatPeriodLabel(filters),
                    statusSummary: summary.statusSummary,
                    monthlySummary: summary.monthlySummary,
                    financeTotals: summary.totals,
                    budgetSummaries,
                    categoryConsumption,
                    budgetMonths,
                    importPreview,
                    recurringIntervalOptions,
                    budgetStatusMeta: financeReportingService.utils?.DEFAULT_STATUS_META || null
                },
                (renderError, html) => {
                    if (renderError) {
                        throw renderError;
                    }
                    res.send(html);
                }
            );
        } catch (err) {
            console.error('Erro ao listar finanças:', err);
            req.flash('error_msg', 'Erro ao listar finanças.');
            res.redirect('/');
        }
    },

    previewFinanceImport: async (req, res) => {
        try {
            if (!req.file) {
                throw new Error('Selecione um arquivo CSV ou OFX para importar.');
            }

            const parseResult = financeImportService.parseFinanceFile(req.file.buffer, {
                filename: req.file.originalname,
                mimetype: req.file.mimetype
            });

            if (!parseResult.entries.length) {
                throw new Error('Nenhum lançamento válido foi encontrado no arquivo.');
            }

            const preview = await buildImportPreview(parseResult.entries);
            const payload = {
                fileName: req.file.originalname,
                uploadedAt: new Date().toISOString(),
                warnings: parseResult.warnings || [],
                ...preview
            };

            if (wantsJsonResponse(req)) {
                return res.json({ ok: true, preview: payload });
            }

            req.session.financeImportPreview = payload;
            req.flash('success_msg', 'Importação analisada. Revise os lançamentos antes de concluir.');
            return res.redirect('/finance');
        } catch (error) {
            console.error('Erro ao pré-processar importação financeira:', error);
            const message = error.message || 'Não foi possível processar o arquivo.';
            if (wantsJsonResponse(req)) {
                return res.status(400).json({ ok: false, message });
            }
            req.flash('error_msg', message);
            return res.redirect('/finance');
        }
    },

    commitFinanceImport: async (req, res) => {
        try {
            const rawEntries = req.body.entries;
            if (!rawEntries) {
                throw new Error('Nenhum lançamento recebido para importação.');
            }

            const entriesArray = Array.isArray(rawEntries)
                ? rawEntries
                : Object.values(rawEntries);

            if (!entriesArray.length) {
                throw new Error('Nenhum lançamento selecionado para importação.');
            }

            const preparedEntries = [];
            const skippedEntries = [];
            const invalidEntries = [];

            entriesArray.forEach((entry) => {
                const includeFlag = entry.include ?? entry.selected ?? entry.import ?? entry.shouldImport;
                const shouldImport = includeFlag === true
                    || includeFlag === 'true'
                    || includeFlag === '1'
                    || includeFlag === 'on';

                if (!shouldImport) {
                    skippedEntries.push(entry);
                    return;
                }

                try {
                    const prepared = financeImportService.prepareEntryForPersistence(entry);
                    preparedEntries.push(prepared);
                } catch (error) {
                    invalidEntries.push({ entry, message: error.message });
                }
            });

            if (!preparedEntries.length) {
                const baseMessage = invalidEntries.length
                    ? 'Nenhum lançamento válido para importar. Verifique os dados informados.'
                    : 'Selecione ao menos um lançamento para importar.';
                throw new Error(baseMessage);
            }

            const dueDates = [...new Set(preparedEntries.map((entry) => entry.dueDate))];
            let existingEntries = [];
            if (dueDates.length) {
                existingEntries = await FinanceEntry.findAll({
                    where: { dueDate: { [Op.in]: dueDates } },
                    attributes: ['id', 'description', 'value', 'dueDate']
                });
            }

            const existingHashes = new Map();
            existingEntries.forEach((entry) => {
                const plain = entry.get({ plain: true });
                const hash = financeImportService.createEntryHash(plain);
                if (!existingHashes.has(hash)) {
                    existingHashes.set(hash, plain);
                }
            });

            const uniqueHashes = new Set();
            const finalEntries = [];
            const duplicateEntries = [];

            preparedEntries.forEach((entry) => {
                if (uniqueHashes.has(entry.hash)) {
                    duplicateEntries.push({ entry, reason: 'Duplicado no lote importado.' });
                    return;
                }
                if (existingHashes.has(entry.hash)) {
                    const existing = existingHashes.get(entry.hash);
                    duplicateEntries.push({ entry, reason: `Já existe lançamento #${existing.id} com os mesmos dados.` });
                    return;
                }
                uniqueHashes.add(entry.hash);
                finalEntries.push(entry);
            });

            let createdRecords = [];
            if (finalEntries.length) {
                const payload = finalEntries.map(({ hash, ...fields }) => fields);
                const result = await FinanceEntry.bulkCreate(payload, { validate: true, returning: true });
                createdRecords = Array.isArray(result) ? result : [];
            }

            const summary = {
                created: createdRecords.length,
                duplicates: duplicateEntries.length,
                invalid: invalidEntries.length,
                skipped: skippedEntries.length,
                totalReceived: entriesArray.length
            };

            req.importAuditResource = `FinanceImport:created=${summary.created}:duplicates=${summary.duplicates}`;

            const parts = [];
            parts.push(`${summary.created} lançamento(s) importado(s).`);
            if (summary.duplicates) {
                parts.push(`${summary.duplicates} duplicado(s) ignorado(s).`);
            }
            if (summary.invalid) {
                parts.push(`${summary.invalid} registro(s) inválido(s).`);
            }
            if (summary.skipped) {
                parts.push(`${summary.skipped} registro(s) não selecionado(s).`);
            }

            const message = parts.join(' ').trim();

            req.session.financeImportPreview = null;

            if (wantsJsonResponse(req)) {
                const statusCode = summary.created ? 201 : 400;
                return res.status(statusCode).json({
                    ok: Boolean(summary.created),
                    message,
                    summary,
                    createdIds: createdRecords.map((record) => record.id).filter((id) => id !== undefined && id !== null)
                });
            }

            if (summary.created) {
                req.flash('success_msg', `Importação concluída. ${message}`);
            } else {
                req.flash('error_msg', message || 'Nenhum lançamento foi importado.');
            }

            return res.redirect('/finance');
        } catch (error) {
            console.error('Erro ao concluir importação financeira:', error);
            const message = error.message || 'Erro ao concluir importação.';
            if (wantsJsonResponse(req)) {
                return res.status(400).json({ ok: false, message });
            }
            req.flash('error_msg', message);
            return res.redirect('/finance');
        }
    },

    createFinanceEntry: async (req, res) => {
        let transaction;
        let storedKeys = [];

        try {
            const { description, type, value, dueDate, recurring, recurringInterval } = req.body;

            transaction = await beginTransaction();

            const createPayload = {
                description,
                type,
                value,
                dueDate,
                recurring: (recurring === 'true'),
                recurringInterval: normalizeRecurringInterval(recurringInterval)
            };

            let entry;
            if (transaction) {
                entry = await FinanceEntry.create(createPayload, { transaction });
            } else {
                entry = await FinanceEntry.create(createPayload);
            }

            storedKeys = await persistAttachments(entry.id, req.files, transaction);

            if (transaction) {
                await transaction.commit();
            }
            req.flash('success_msg', 'Lançamento criado com sucesso!');
            res.redirect('/finance');
        } catch (err) {
            if (transaction) {
                try {
                    await transaction.rollback();
                } catch (rollbackError) {
                    console.error('Erro ao desfazer transação de criação:', rollbackError);
                }
            }

            await removeStoredFiles(storedKeys);

            console.error(err);
            req.flash('error_msg', 'Erro ao criar lançamento.');
            res.redirect('/finance');
        }
    },

    updateFinanceEntry: async (req, res) => {
        let transaction;
        let storedKeys = [];

        try {
            const { id } = req.params;
            const { description, type, value, dueDate, paymentDate, status, recurring, recurringInterval } = req.body;

            transaction = await beginTransaction();

            let entry;
            if (transaction) {
                entry = await FinanceEntry.findByPk(id, { transaction });
            } else {
                entry = await FinanceEntry.findByPk(id);
            }

            if (!entry) {
                if (transaction) {
                    await transaction.rollback();
                }
                req.flash('error_msg', 'Lançamento não encontrado.');
                return res.redirect('/finance');
            }

            entry.description = description;
            entry.type = type;
            entry.value = value;
            entry.dueDate = dueDate;
            entry.paymentDate = paymentDate || null;
            entry.status = status;
            entry.recurring = (recurring === 'true');
            entry.recurringInterval = normalizeRecurringInterval(recurringInterval);

            if (transaction) {
                await entry.save({ transaction });
            } else {
                await entry.save();
            }

            storedKeys = await persistAttachments(entry.id, req.files, transaction);

            if (transaction) {
                await transaction.commit();
            }

            req.flash('success_msg', 'Lançamento atualizado!');
            res.redirect('/finance');
        } catch (err) {
            if (transaction) {
                try {
                    await transaction.rollback();
                } catch (rollbackError) {
                    console.error('Erro ao desfazer transação de atualização:', rollbackError);
                }
            }

            await removeStoredFiles(storedKeys);

            console.error(err);
            req.flash('error_msg', 'Erro ao atualizar lançamento.');
            res.redirect('/finance');
        }
    },

    deleteFinanceEntry: async (req, res) => {
        try {
            const { id } = req.params;
            const entry = await FinanceEntry.findByPk(id);
            if (!entry) {
                req.flash('error_msg', 'Lançamento não encontrado.');
                return res.redirect('/finance');
            }

            const attachments = await FinanceAttachment.findAll({
                where: { financeEntryId: entry.id },
                attributes: ['storageKey'],
                raw: true
            });

            await entry.destroy();

            const storageKeys = attachments.map((item) => item.storageKey).filter(Boolean);
            if (storageKeys.length) {
                await removeStoredFiles(storageKeys);
            }

            req.flash('success_msg', 'Lançamento removido com sucesso.');
            res.redirect('/finance');
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao excluir lançamento.');
            res.redirect('/finance');
        }
    },

    saveFinanceGoal: async (req, res) => {
        try {
            const { goalId, month, targetNetAmount, notes } = req.body;
            const normalizedMonth = normalizeGoalMonth(month);

            if (!normalizedMonth) {
                req.flash('error_msg', 'Período da meta inválido.');
                return res.redirect('/finance');
            }

            const parsedAmount = normalizeAmountInput(targetNetAmount);
            if (!Number.isFinite(parsedAmount)) {
                req.flash('error_msg', 'Valor da meta inválido.');
                return res.redirect('/finance');
            }

            const cleanedNotes = sanitizeText(notes);
            const finalNotes = cleanedNotes ? cleanedNotes : null;

            if (goalId) {
                const goal = await FinanceGoal.findByPk(goalId);
                if (!goal) {
                    req.flash('error_msg', 'Meta financeira não encontrada.');
                    return res.redirect('/finance');
                }

                goal.month = normalizedMonth;
                goal.targetNetAmount = parsedAmount;
                goal.notes = finalNotes;
                await goal.save();
                req.flash('success_msg', 'Meta financeira atualizada com sucesso!');
            } else {
                const [goal, created] = await FinanceGoal.findOrCreate({
                    where: { month: normalizedMonth },
                    defaults: {
                        targetNetAmount: parsedAmount,
                        notes: finalNotes
                    }
                });

                if (!created) {
                    goal.targetNetAmount = parsedAmount;
                    goal.notes = finalNotes;
                    await goal.save();
                    req.flash('success_msg', 'Meta financeira atualizada com sucesso!');
                } else {
                    req.flash('success_msg', 'Meta financeira cadastrada com sucesso!');
                }
            }

            return res.redirect('/finance');
        } catch (error) {
            console.error(error);
            req.flash('error_msg', 'Erro ao salvar meta financeira.');
            return res.redirect('/finance');
        }
    },

    deleteFinanceGoal: async (req, res) => {
        try {
            const { id } = req.params;
            const goal = await FinanceGoal.findByPk(id);
            if (!goal) {
                req.flash('error_msg', 'Meta financeira não encontrada.');
                return res.redirect('/finance');
            }

            await goal.destroy();
            req.flash('success_msg', 'Meta financeira removida.');
            return res.redirect('/finance');
        } catch (error) {
            console.error(error);
            req.flash('error_msg', 'Erro ao remover meta financeira.');
            return res.redirect('/finance');
        }
    },

    exportPdf: async (req, res) => {
        try {
            const filters = buildFiltersFromQuery(req.query);
            const entriesPromise = FinanceEntry.findAll(buildEntriesQueryOptions(filters));
            const summaryPromise = createSummaryPromise(entriesPromise, filters);
            const budgetOverviewPromise = financeReportingService.getBudgetSummaries(filters, {
                includeCategoryConsumption: true,
                entriesPromise
            });

            const [entries, summary, budgetOverview] = await Promise.all([
                entriesPromise,
                summaryPromise,
                budgetOverviewPromise
            ]);

            const chartImage = await reportChartService.generateFinanceReportChart(summary);
            const budgetSummaries = Array.isArray(budgetOverview?.summaries)
                ? budgetOverview.summaries
                : [];
            const categoryConsumption = Array.isArray(budgetOverview?.categoryConsumption)
                ? budgetOverview.categoryConsumption
                : [];

            const document = new PDFDocument({
                margin: 40,
                size: 'A4',
                info: {
                    Title: 'Relatório Financeiro'
                }
            });

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="relatorio-financeiro-${Date.now()}.pdf"`
            );

            document.pipe(res);

            document.fontSize(20).text('Relatório Financeiro', { align: 'center' });
            document.moveDown();

            document.fontSize(12).fillColor('#333333').text(`Período: ${formatPeriodLabel(filters)}`);
            document.moveDown();

            document.fontSize(12);
            document.text(`Total a Receber: ${formatCurrency(summary.totals.receivable)}`);
            document.text(`Total a Pagar: ${formatCurrency(summary.totals.payable)}`);
            document.text(`Saldo Projetado: ${formatCurrency(summary.totals.net)}`);
            document.text(`Pagamentos em Atraso: ${formatCurrency(summary.totals.overdue)}`);
            document.moveDown();

            if (chartImage?.buffer instanceof Buffer) {
                const availableWidth = document.page.width - document.page.margins.left - document.page.margins.right;
                const imageWidth = Math.min(availableWidth, chartImage.width || availableWidth);

                document.fontSize(14).fillColor('#000000').text('Resumo Visual', { underline: true });
                document.moveDown(0.5);
                document.image(chartImage.buffer, {
                    width: imageWidth,
                    align: 'center'
                });
                document.moveDown(0.35);
                document.fontSize(10).fillColor('#555555').text(
                    'Figura 1 - Comparativo mensal de valores a pagar e a receber.',
                    { align: 'center' }
                );
                document.moveDown();
            }

            document.fontSize(14).fillColor('#000000').text('Lançamentos', { underline: true });
            document.moveDown(0.5);

            if (!entries.length) {
                document.fontSize(11).text('Nenhum lançamento encontrado para o período selecionado.');
            } else {
                document.fontSize(11).text('Descrição | Categoria | Tipo | Valor | Vencimento | Status');
                document.moveDown(0.3);
                document.fontSize(10);

                entries.forEach((entry) => {
                    const categoryLabel = sanitizeText(entry?.category?.name || '—');
                    const line = [
                        sanitizeText(entry.description),
                        categoryLabel,
                        entry.type === 'payable' ? 'Pagar' : 'Receber',
                        formatCurrency(entry.value),
                        formatDateLabel(entry.dueDate) || '—',
                        sanitizeText(entry.status || 'pendente')
                    ].join(' | ');
                    document.text(line);
                });
            }

            if (budgetSummaries.length) {
                document.moveDown();
                document.fontSize(14).fillColor('#000000').text('Resumo de Orçamentos', { underline: true });
                document.moveDown(0.4);

                let currentMonth = null;
                budgetSummaries.forEach((item) => {
                    if (item.month !== currentMonth) {
                        currentMonth = item.month;
                        document.moveDown(0.2);
                        document.fontSize(12).fillColor('#2563eb').text(item.monthLabel || item.month);
                        document.moveDown(0.1);
                    }

                    const statusColor = item.statusMeta?.textColor || '#1f2937';
                    const infoColor = '#4b5563';
                    document.fontSize(11).fillColor('#111827').text(item.categoryName);
                    document.fontSize(10).fillColor(infoColor).text(
                        `Limite: ${formatCurrency(item.monthlyLimit)} | Consumido: ${formatCurrency(item.consumption)} | Disponível: ${formatCurrency(item.remaining)} | Utilização: ${item.percentage.toFixed(1)}%`
                    );
                    document.fontSize(10).fillColor(statusColor).text(`Status: ${item.statusLabel}`);
                    document.moveDown(0.2);
                });
            }

            if (categoryConsumption.length) {
                document.moveDown();
                document.fontSize(14).fillColor('#000000').text('Top categorias por consumo', { underline: true });
                document.moveDown(0.4);

                categoryConsumption.slice(0, 5).forEach((item, index) => {
                    const statusColor = item.statusMeta?.textColor || '#111827';
                    document.fontSize(11).fillColor('#111827').text(
                        `${index + 1}. ${item.categoryName}`
                    );
                    document.fontSize(10).fillColor('#4b5563').text(
                        `Períodos: ${item.months} | Limite total: ${formatCurrency(item.totalLimit)} | Consumido: ${formatCurrency(item.totalConsumption)} | Disponível: ${formatCurrency(item.remaining)}`
                    );
                    document.fontSize(10).fillColor(statusColor).text(
                        `Média de utilização: ${item.averagePercentage.toFixed(1)}% | Maior pico: ${item.highestPercentage.toFixed(1)}%`
                    );
                    document.moveDown(0.2);
                });
            }

            document.end();
        } catch (err) {
            console.error('Erro ao exportar PDF:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Erro ao exportar PDF.' });
            } else {
                res.end();
            }
        }
    },

    exportExcel: async (req, res) => {
        try {
            const filters = buildFiltersFromQuery(req.query);
            const entriesPromise = FinanceEntry.findAll(buildEntriesQueryOptions(filters));
            const summaryPromise = createSummaryPromise(entriesPromise, filters);
            const budgetOverviewPromise = financeReportingService.getBudgetSummaries(filters, {
                includeCategoryConsumption: true,
                entriesPromise
            });

            const [entries, summary, budgetOverview] = await Promise.all([
                entriesPromise,
                summaryPromise,
                budgetOverviewPromise
            ]);

            const chartImage = await reportChartService.generateFinanceReportChart(summary, {
                width: 720,
                height: 360
            });

            const budgetSummaries = Array.isArray(budgetOverview?.summaries)
                ? budgetOverview.summaries
                : [];
            const categoryConsumption = Array.isArray(budgetOverview?.categoryConsumption)
                ? budgetOverview.categoryConsumption
                : [];

            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Sistema de Gestão';
            workbook.created = new Date();

            const summarySheet = workbook.addWorksheet('Resumo');
            summarySheet.addRow(['Relatório Financeiro']);
            summarySheet.addRow([`Período: ${formatPeriodLabel(filters)}`]);
            summarySheet.addRow(['Total a Receber', parseAmount(summary.totals.receivable)]);
            summarySheet.addRow(['Total a Pagar', parseAmount(summary.totals.payable)]);
            summarySheet.addRow(['Saldo Projetado', parseAmount(summary.totals.net)]);
            summarySheet.addRow(['Pagamentos em Atraso', parseAmount(summary.totals.overdue)]);
            summarySheet.addRow(['Pagamentos Pendentes', parseAmount(summary.totals.pending)]);
            summarySheet.addRow(['Pagamentos Concluídos', parseAmount(summary.totals.paid)]);

            if (chartImage?.buffer instanceof Buffer) {
                const imageId = workbook.addImage({
                    buffer: chartImage.buffer,
                    extension: 'png'
                });

                const startRow = summarySheet.rowCount + 2;
                const endRow = startRow + 12;
                const endColumn = 'H';

                while (summarySheet.rowCount < endRow) {
                    summarySheet.addRow([]);
                }

                summarySheet.addImage(imageId, `A${startRow}:${endColumn}${endRow}`);

                const captionRow = endRow + 1;
                while (summarySheet.rowCount < captionRow) {
                    summarySheet.addRow([]);
                }

                summarySheet.mergeCells(`A${captionRow}:${endColumn}${captionRow}`);
                const captionCell = summarySheet.getCell(`A${captionRow}`);
                captionCell.value = 'Figura 1: Comparativo mensal de valores a pagar e a receber';
                captionCell.alignment = { horizontal: 'center' };
                captionCell.font = {
                    italic: true,
                    color: { argb: 'FF6B7280' }
                };
            }

            const worksheet = workbook.addWorksheet('Lançamentos');
            worksheet.columns = [
                { header: 'Descrição', key: 'description', width: 40 },
                { header: 'Categoria', key: 'category', width: 26 },
                { header: 'Tipo', key: 'type', width: 15 },
                { header: 'Valor (R$)', key: 'value', width: 18 },
                { header: 'Vencimento', key: 'dueDate', width: 18 },
                { header: 'Status', key: 'status', width: 18 }
            ];

            if (!entries.length) {
                worksheet.addRow({
                    description: 'Nenhum lançamento para o período selecionado',
                    category: '',
                    type: '',
                    value: '',
                    dueDate: '',
                    status: ''
                });
            } else {
                entries.forEach((entry) => {
                    worksheet.addRow({
                        description: sanitizeText(entry.description),
                        category: sanitizeText(entry?.category?.name || ''),
                        type: entry.type === 'payable' ? 'Pagar' : 'Receber',
                        value: parseAmount(entry.value),
                        dueDate: formatDateLabel(entry.dueDate) || '',
                        status: sanitizeText(entry.status || 'pendente')
                    });
                });
            }

            if (budgetSummaries.length) {
                const budgetSheet = workbook.addWorksheet('Orçamentos');
                budgetSheet.columns = [
                    { header: 'Mês', key: 'month', width: 18 },
                    { header: 'Categoria', key: 'category', width: 28 },
                    { header: 'Limite Mensal (R$)', key: 'limit', width: 20 },
                    { header: 'Consumido (R$)', key: 'consumption', width: 20 },
                    { header: 'Disponível (R$)', key: 'remaining', width: 20 },
                    { header: 'Utilização (%)', key: 'percentage', width: 18 },
                    { header: 'Status', key: 'status', width: 24 }
                ];

                budgetSummaries.forEach((item) => {
                    const row = budgetSheet.addRow({
                        month: item.monthLabel || item.month,
                        category: item.categoryName,
                        limit: parseAmount(item.monthlyLimit),
                        consumption: parseAmount(item.consumption),
                        remaining: parseAmount(item.remaining),
                        percentage: Number(item.percentage || 0),
                        status: item.statusLabel
                    });

                    const statusColor = toExcelColor(item.statusMeta?.barColor, 'FF2563EB');
                    const statusCell = row.getCell('status');
                    statusCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: statusColor }
                    };
                    statusCell.font = {
                        color: { argb: 'FFFFFFFF' },
                        bold: true
                    };
                });

                budgetSheet.getRow(1).font = { bold: true };
                budgetSheet.getRow(1).alignment = { horizontal: 'center' };
            }

            if (categoryConsumption.length) {
                const categorySheet = workbook.addWorksheet('Resumo Categorias');
                categorySheet.columns = [
                    { header: 'Categoria', key: 'category', width: 28 },
                    { header: 'Meses Monitorados', key: 'months', width: 18 },
                    { header: 'Limite Total (R$)', key: 'limit', width: 20 },
                    { header: 'Consumido (R$)', key: 'consumption', width: 20 },
                    { header: 'Disponível (R$)', key: 'remaining', width: 20 },
                    { header: 'Média de Utilização (%)', key: 'average', width: 22 },
                    { header: 'Maior Pico (%)', key: 'peak', width: 18 },
                    { header: 'Status', key: 'status', width: 24 }
                ];

                categoryConsumption.forEach((item) => {
                    const row = categorySheet.addRow({
                        category: item.categoryName,
                        months: item.months,
                        limit: parseAmount(item.totalLimit),
                        consumption: parseAmount(item.totalConsumption),
                        remaining: parseAmount(item.remaining),
                        average: Number(item.averagePercentage || 0),
                        peak: Number(item.highestPercentage || 0),
                        status: item.statusLabel
                    });

                    const statusColor = toExcelColor(item.statusMeta?.barColor, 'FF2563EB');
                    const statusCell = row.getCell('status');
                    statusCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: statusColor }
                    };
                    statusCell.font = {
                        color: { argb: 'FFFFFFFF' },
                        bold: true
                    };
                });

                categorySheet.getRow(1).font = { bold: true };
                categorySheet.getRow(1).alignment = { horizontal: 'center' };
            }

            res.setHeader(
                'Content-Type',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="relatorio-financeiro-${Date.now()}.xlsx"`
            );

            await workbook.xlsx.write(res);
            res.end();
        } catch (err) {
            console.error('Erro ao exportar Excel:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Erro ao exportar Excel.' });
            } else {
                res.end();
            }
        }
    },

    downloadAttachment: async (req, res) => {
        try {
            const { attachmentId } = req.params;

            const attachment = await FinanceAttachment.findByPk(attachmentId);
            if (!attachment) {
                req.flash('error_msg', 'Anexo não encontrado.');
                return res.redirect('/finance');
            }

            let stream;
            try {
                stream = fileStorageService.createReadStream(attachment.storageKey);
            } catch (error) {
                console.error('Erro ao acessar anexo de finanças:', error);
                req.flash('error_msg', 'Arquivo de anexo indisponível.');
                return res.redirect('/finance');
            }

            res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
            if (Number.isFinite(Number(attachment.size))) {
                res.setHeader('Content-Length', String(attachment.size));
            }
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.fileName)}"`);
            res.setHeader('Cache-Control', 'no-store');

            await pipeline(stream, res);
        } catch (err) {
            console.error('Erro ao baixar anexo financeiro:', err);
            if (!res.headersSent) {
                req.flash('error_msg', 'Erro ao baixar anexo.');
                res.redirect('/finance');
            }
        }
    }
};
