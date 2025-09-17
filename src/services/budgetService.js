const { Op } = require('sequelize');

const {
    Budget,
    FinanceCategory,
    sequelize
} = require('../../database/models');
const financeReportingService = require('./financeReportingService');

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const CACHE_TTL_MS = Number(process.env.BUDGET_CACHE_TTL_MS) || 30_000;

const listCache = new Map();

const now = () => Date.now();

const sortObjectKeys = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return value;
    }

    return Object.keys(value)
        .sort()
        .reduce((acc, key) => {
            acc[key] = sortObjectKeys(value[key]);
            return acc;
        }, {});
};

const buildCacheKey = (filters = {}, options = {}) => {
    const normalizedFilters = sortObjectKeys(filters || {});
    const normalizedOptions = sortObjectKeys({
        page: options.page,
        pageSize: options.pageSize,
        includeCategory: options.includeCategory !== false
    });
    return JSON.stringify({ filters: normalizedFilters, options: normalizedOptions });
};

const getCachedValue = (key) => {
    if (!listCache.has(key)) {
        return null;
    }
    const entry = listCache.get(key);
    if (!entry || (now() - entry.timestamp) > CACHE_TTL_MS) {
        listCache.delete(key);
        return null;
    }
    return entry.value;
};

const setCachedValue = (key, value) => {
    listCache.set(key, { timestamp: now(), value });
};

const clearCache = () => {
    listCache.clear();
};

const normalizePagination = (page, pageSize) => {
    const normalizedPage = Number.isInteger(Number(page)) && Number(page) > 0
        ? Number(page)
        : 1;

    let normalizedPageSize = Number.isInteger(Number(pageSize)) && Number(pageSize) > 0
        ? Number(pageSize)
        : DEFAULT_PAGE_SIZE;

    normalizedPageSize = Math.min(MAX_PAGE_SIZE, normalizedPageSize);

    const offset = (normalizedPage - 1) * normalizedPageSize;

    return {
        page: normalizedPage,
        pageSize: normalizedPageSize,
        offset,
        limit: normalizedPageSize
    };
};

const buildWhere = (filters = {}) => {
    const where = {};

    if (filters.id) {
        const idValue = Number(filters.id);
        if (Number.isInteger(idValue)) {
            where.id = idValue;
        }
    }

    if (filters.userId !== undefined) {
        const userId = Number(filters.userId);
        if (Number.isInteger(userId)) {
            where.userId = userId;
        }
    }

    if (filters.financeCategoryId !== undefined || filters.categoryId !== undefined) {
        const categoryId = Number(filters.financeCategoryId ?? filters.categoryId);
        if (Number.isInteger(categoryId)) {
            where.financeCategoryId = categoryId;
        }
    }

    if (filters.referenceMonth) {
        if (Array.isArray(filters.referenceMonth)) {
            const values = filters.referenceMonth
                .map((item) => (typeof item === 'string' ? item.trim() : null))
                .filter((item) => item && /^\d{4}-\d{2}-\d{2}$/.test(item));
            if (values.length) {
                where.referenceMonth = { [Op.in]: values };
            }
        } else if (typeof filters.referenceMonth === 'string') {
            const trimmed = filters.referenceMonth.trim();
            if (/^\d{4}-\d{2}$/.test(trimmed)) {
                where.referenceMonth = `${trimmed}-01`;
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
                where.referenceMonth = trimmed;
            }
        }
    }

    return where;
};

const buildInclude = (options = {}) => {
    if (options.includeCategory === false) {
        return [];
    }

    if (!FinanceCategory) {
        return [];
    }

    return [
        {
            model: FinanceCategory,
            as: 'category',
            attributes: ['id', 'name', 'slug', 'color'],
            required: false
        }
    ];
};

const handleMissingTableError = (error) => {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const message = String(error.message || '').toLowerCase();
    return message.includes('relation "budgets" does not exist')
        || message.includes('no such table: budgets')
        || message.includes('table "budgets" does not exist');
};

const listBudgets = async (filters = {}, options = {}) => {
    if (!Budget || typeof Budget.findAndCountAll !== 'function') {
        return {
            data: [],
            pagination: { page: 1, pageSize: DEFAULT_PAGE_SIZE, totalItems: 0, totalPages: 0 }
        };
    }

    const pagination = normalizePagination(options.page, options.pageSize);

    const cacheKey = options.disableCache ? null : buildCacheKey(filters, { ...options, ...pagination });
    if (cacheKey) {
        const cached = getCachedValue(cacheKey);
        if (cached) {
            return cached;
        }
    }

    const queryOptions = {
        where: buildWhere(filters),
        include: buildInclude(options),
        order: [['financeCategoryId', 'ASC'], ['id', 'ASC']],
        distinct: true,
        limit: pagination.limit,
        offset: pagination.offset,
        raw: false
    };

    try {
        const result = await Budget.findAndCountAll(queryOptions);
        const rows = Array.isArray(result.rows) ? result.rows : [];
        const totalItems = Number(result.count) || rows.length;
        const totalPages = pagination.pageSize > 0
            ? Math.ceil(totalItems / pagination.pageSize)
            : 1;

        const payload = {
            data: rows.map((item) => (typeof item?.get === 'function' ? item.get({ plain: true }) : item)),
            pagination: {
                page: pagination.page,
                pageSize: pagination.pageSize,
                totalItems,
                totalPages
            }
        };

        if (cacheKey) {
            setCachedValue(cacheKey, payload);
        }

        return payload;
    } catch (error) {
        if (handleMissingTableError(error)) {
            return {
                data: [],
                pagination: {
                    page: pagination.page,
                    pageSize: pagination.pageSize,
                    totalItems: 0,
                    totalPages: 0
                }
            };
        }
        throw error;
    }
};

const getBudgetById = async (id, options = {}) => {
    if (!Budget || typeof Budget.findByPk !== 'function') {
        return null;
    }

    if (!Number.isInteger(Number(id))) {
        return null;
    }

    const queryOptions = {
        include: buildInclude(options)
    };

    if (options.transaction) {
        queryOptions.transaction = options.transaction;
    }

    const budget = await Budget.findByPk(Number(id), queryOptions);
    return budget && typeof budget.get === 'function' ? budget.get({ plain: true }) : budget;
};

const normalizeThresholds = (thresholds) => {
    if (typeof Budget?.normalizeThresholds === 'function') {
        return Budget.normalizeThresholds(thresholds);
    }

    if (thresholds === undefined || thresholds === null) {
        return [];
    }

    const source = Array.isArray(thresholds) ? thresholds : [thresholds];
    const numeric = source
        .map((item) => {
            const parsed = Number(item);
            return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
        })
        .filter((value) => value !== null && value > 0);

    const unique = Array.from(new Set(numeric));
    unique.sort((a, b) => a - b);
    return unique;
};

const normalizeReferenceMonth = (value) => {
    if (!value) {
        return null;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }

        if (/^\d{4}-\d{2}$/.test(trimmed)) {
            return `${trimmed}-01`;
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            return trimmed;
        }
    }

    const date = value instanceof Date ? value : new Date(value);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return null;
    }

    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
};

const normalizeMonthlyLimit = (value) => {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
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
        return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
    }

    return null;
};

const prepareBudgetPayload = (payload = {}) => {
    const normalized = {};

    if (payload.monthlyLimit !== undefined) {
        const limit = normalizeMonthlyLimit(payload.monthlyLimit);
        if (limit === null || limit <= 0) {
            throw new Error('Limite mensal inválido.');
        }
        normalized.monthlyLimit = limit;
    }

    if (payload.thresholds !== undefined) {
        normalized.thresholds = normalizeThresholds(payload.thresholds);
    }

    if (payload.referenceMonth !== undefined) {
        normalized.referenceMonth = normalizeReferenceMonth(payload.referenceMonth);
    }

    if (payload.userId !== undefined) {
        const userId = Number(payload.userId);
        if (!Number.isInteger(userId)) {
            throw new Error('Usuário inválido.');
        }
        normalized.userId = userId;
    }

    if (payload.financeCategoryId !== undefined || payload.categoryId !== undefined) {
        const categoryId = Number(payload.financeCategoryId ?? payload.categoryId);
        if (!Number.isInteger(categoryId)) {
            throw new Error('Categoria financeira inválida.');
        }
        normalized.financeCategoryId = categoryId;
    }

    return normalized;
};

const createBudget = async (payload = {}, options = {}) => {
    if (!Budget || typeof Budget.create !== 'function') {
        throw new Error('Modelo de orçamento não disponível.');
    }

    const normalizedPayload = prepareBudgetPayload(payload);

    if (!('monthlyLimit' in normalizedPayload)) {
        throw new Error('Limite mensal é obrigatório.');
    }

    if (normalizedPayload.userId === undefined || normalizedPayload.financeCategoryId === undefined) {
        throw new Error('Usuário e categoria são obrigatórios.');
    }

    const createOptions = {};

    if (options.transaction) {
        createOptions.transaction = options.transaction;
    }

    try {
        const budget = await Budget.create(normalizedPayload, createOptions);
        clearCache();
        return typeof budget?.get === 'function' ? budget.get({ plain: true }) : budget;
    } catch (error) {
        if (handleMissingTableError(error)) {
            throw new Error('Tabela de orçamentos inexistente. Execute as migrações do banco de dados.');
        }
        throw error;
    }
};

const updateBudget = async (id, payload = {}, options = {}) => {
    if (!Budget || typeof Budget.findByPk !== 'function') {
        throw new Error('Modelo de orçamento não disponível.');
    }

    if (!Number.isInteger(Number(id))) {
        throw new Error('Identificador de orçamento inválido.');
    }

    const budget = await Budget.findByPk(Number(id), { transaction: options.transaction });
    if (!budget) {
        return null;
    }

    const normalizedPayload = prepareBudgetPayload(payload);

    Object.entries(normalizedPayload).forEach(([key, value]) => {
        budget[key] = value;
    });

    await budget.save({ transaction: options.transaction });
    clearCache();

    return typeof budget.get === 'function' ? budget.get({ plain: true }) : budget;
};

const deleteBudget = async (id, options = {}) => {
    if (!Budget || typeof Budget.destroy !== 'function') {
        throw new Error('Modelo de orçamento não disponível.');
    }

    if (!Number.isInteger(Number(id))) {
        throw new Error('Identificador de orçamento inválido.');
    }

    const destroyOptions = { where: { id: Number(id) } };
    if (options.transaction) {
        destroyOptions.transaction = options.transaction;
    }

    const deleted = await Budget.destroy(destroyOptions);
    if (deleted) {
        clearCache();
    }

    return deleted > 0;
};

const getBudgetOverview = async (filters = {}, options = {}) => {
    const overview = await financeReportingService.getBudgetSummaries(filters, {
        ...options,
        includeCategoryConsumption: true
    });

    if (!overview) {
        return { summaries: [], categoryConsumption: [], months: [] };
    }

    if (Array.isArray(overview)) {
        return { summaries: overview, categoryConsumption: [], months: [] };
    }

    const summaries = Array.isArray(overview.summaries) ? overview.summaries : [];
    const categoryConsumption = Array.isArray(overview.categoryConsumption) ? overview.categoryConsumption : [];
    const months = Array.isArray(overview.months) ? overview.months : [];

    return { summaries, categoryConsumption, months };
};

const getCategoryConsumption = async (filters = {}, options = {}) => {
    const overview = await getBudgetOverview(filters, options);
    return overview.categoryConsumption;
};

const summarizeBudgetConsumption = (summaries = [], budgetId) => {
    if (!Array.isArray(summaries) || !summaries.length) {
        return null;
    }

    const filtered = summaries.filter((item) => {
        if (!item) {
            return false;
        }
        if (budgetId && item.budgetId) {
            return Number(item.budgetId) === Number(budgetId);
        }
        if (budgetId && !item.budgetId && item.categoryId) {
            return Number(item.categoryId) === Number(budgetId);
        }
        return false;
    });

    if (!filtered.length) {
        return null;
    }

    const totalLimit = filtered.reduce((acc, item) => acc + (Number(item.monthlyLimit) || 0), 0);
    const totalConsumption = filtered.reduce((acc, item) => acc + (Number(item.consumption) || 0), 0);
    const remaining = totalLimit - totalConsumption;
    const percentage = totalLimit > 0 ? (totalConsumption / totalLimit) * 100 : 0;
    const thresholds = filtered[0]?.thresholds || [];
    const statusMeta = financeReportingService.utils?.resolveBudgetStatus
        ? financeReportingService.utils.resolveBudgetStatus(totalConsumption, totalLimit, thresholds)
        : { key: 'unknown', label: 'Desconhecido' };

    return {
        budgetId: filtered[0]?.budgetId || null,
        categoryId: filtered[0]?.categoryId || null,
        totalLimit,
        totalConsumption,
        remaining,
        percentage,
        thresholds,
        status: statusMeta.key,
        statusLabel: statusMeta.label,
        statusMeta,
        months: filtered.map((item) => item.month)
    };
};

const getBudgetConsumptionSummary = async (budgetId, filters = {}, options = {}) => {
    if (!budgetId) {
        throw new Error('É necessário informar o orçamento para gerar o resumo.');
    }

    const overview = await getBudgetOverview(filters, options);
    return summarizeBudgetConsumption(overview.summaries, budgetId);
};

const beginTransaction = async () => {
    if (sequelize && typeof sequelize.transaction === 'function') {
        return sequelize.transaction();
    }

    if (Budget?.sequelize && typeof Budget.sequelize.transaction === 'function') {
        return Budget.sequelize.transaction();
    }

    return null;
};

module.exports = {
    listBudgets,
    getBudgetById,
    createBudget,
    updateBudget,
    deleteBudget,
    getBudgetOverview,
    getCategoryConsumption,
    getBudgetConsumptionSummary,
    beginTransaction,
    constants: {
        DEFAULT_STATUS_META: financeReportingService.utils?.DEFAULT_STATUS_META || null
    },
    __testing: {
        clearCache,
        summarizeBudgetConsumption,
        buildCacheKey,
        listCache
    }
};
