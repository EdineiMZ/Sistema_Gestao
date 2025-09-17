const { Budget } = require('../../database/models');
const financeReportingService = require('./financeReportingService');

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const listCache = new Map();

const clearCache = () => {
    listCache.clear();
};

const normalizeId = (value) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }

    return parsed;
};

const normalizeNumber = (value) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }

        const sanitized = trimmed.replace(/\./g, '').replace(',', '.');
        const parsed = Number.parseFloat(sanitized);
        return Number.isFinite(parsed) ? parsed : null;
    }

    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
};

const normalizeThresholdList = (value) => {
    if (value === undefined || value === null) {
        return [];
    }

    const list = Array.isArray(value) ? value : [value];
    const normalized = list
        .map((item) => normalizeNumber(item))
        .filter((item) => Number.isFinite(item) && item > 0)
        .map((item) => Number(item.toFixed(4)));

    const uniqueValues = Array.from(new Set(normalized));
    uniqueValues.sort((a, b) => a - b);
    return uniqueValues;
};

const normalizeReferenceMonth = (value) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            return null;
        }
        return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1)).toISOString().slice(0, 10);
    }

    if (typeof value === 'number') {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return null;
        }
        return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }

        let reference;
        if (/^\d{4}-\d{2}$/.test(trimmed)) {
            reference = new Date(`${trimmed}-01T00:00:00Z`);
        } else {
            reference = new Date(trimmed);
        }

        if (Number.isNaN(reference.getTime())) {
            return null;
        }

        return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1)).toISOString().slice(0, 10);
    }

    return null;
};

const buildBudgetPayload = (input = {}) => {
    const payload = {};

    if ('monthlyLimit' in input) {
        const monthlyLimit = normalizeNumber(input.monthlyLimit);
        if (monthlyLimit !== null) {
            payload.monthlyLimit = monthlyLimit;
        }
    }

    if ('thresholds' in input) {
        payload.thresholds = normalizeThresholdList(input.thresholds);
    }

    if ('referenceMonth' in input) {
        payload.referenceMonth = normalizeReferenceMonth(input.referenceMonth);
    }

    if ('userId' in input) {
        const userId = normalizeId(input.userId);
        if (userId !== null) {
            payload.userId = userId;
        }
    }

    if ('financeCategoryId' in input) {
        const financeCategoryId = normalizeId(input.financeCategoryId);
        if (financeCategoryId !== null) {
            payload.financeCategoryId = financeCategoryId;
        }
    }

    return payload;
};

const normalizePagination = (pagination = {}) => {
    const pageValue = Number.parseInt(pagination.page, 10);
    const sizeValue = Number.parseInt(pagination.pageSize, 10);

    const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : DEFAULT_PAGE;
    const pageSize = Number.isInteger(sizeValue) && sizeValue > 0 ? Math.min(sizeValue, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;

    return { page, pageSize };
};

const buildCacheKey = (filters, pagination) => JSON.stringify({ filters, pagination });

const formatBudgetRow = (row) => {
    if (row && typeof row.get === 'function') {
        return row.get({ plain: true });
    }

    if (row && typeof row.toJSON === 'function') {
        return row.toJSON();
    }

    return { ...row };
};

const listBudgets = async (filters = {}, pagination = {}, options = {}) => {
    const where = {};
    const userId = normalizeId(filters.userId);
    const financeCategoryId = normalizeId(filters.financeCategoryId);

    if (userId !== null) {
        where.userId = userId;
    }

    if (financeCategoryId !== null) {
        where.financeCategoryId = financeCategoryId;
    }

    const { page, pageSize } = normalizePagination(pagination);
    const cacheKey = buildCacheKey(where, { page, pageSize });

    if (listCache.has(cacheKey)) {
        const cached = listCache.get(cacheKey);
        return {
            data: cached.data.map((item) => ({ ...item })),
            pagination: { ...cached.pagination }
        };
    }

    try {
        const result = await Budget.findAndCountAll({
            where,
            limit: pageSize,
            offset: (page - 1) * pageSize,
            order: [['referenceMonth', 'DESC'], ['financeCategoryId', 'ASC']],
            ...options
        });

        const data = Array.isArray(result.rows) ? result.rows.map(formatBudgetRow) : [];
        const totalItems = Number.isFinite(result.count) ? result.count : Array.isArray(result.rows) ? result.rows.length : 0;
        const totalPages = pageSize > 0 ? Math.ceil(totalItems / pageSize) : 0;

        const payload = {
            data,
            pagination: {
                page,
                pageSize,
                totalItems,
                totalPages
            }
        };

        listCache.set(cacheKey, payload);

        return {
            data: data.map((item) => ({ ...item })),
            pagination: { ...payload.pagination }
        };
    } catch (error) {
        if (typeof error.message === 'string' && error.message.includes('no such table: budgets')) {
            return {
                data: [],
                pagination: {
                    page: DEFAULT_PAGE,
                    pageSize: DEFAULT_PAGE_SIZE,
                    totalItems: 0,
                    totalPages: 0
                }
            };
        }

        throw error;
    }
};

const findBudgetById = async ({ id, userId }, options = {}) => {
    const budgetId = normalizeId(id);
    if (budgetId === null) {
        return null;
    }

    const where = { id: budgetId };
    const normalizedUserId = normalizeId(userId);
    if (normalizedUserId !== null) {
        where.userId = normalizedUserId;
    }

    return Budget.findOne({ where, ...options });
};

const createBudget = async (data = {}, options = {}) => {
    const payload = buildBudgetPayload(data);
    const budget = await Budget.create(payload, options);
    clearCache();
    return typeof budget.get === 'function' ? budget.get({ plain: true }) : budget;
};

const updateBudget = async (budgetId, data = {}, options = {}) => {
    const targetId = normalizeId(budgetId);
    if (targetId === null) {
        return null;
    }

    const budget = await Budget.findByPk(targetId, { transaction: options.transaction });
    if (!budget) {
        return null;
    }

    const updates = buildBudgetPayload(data);
    Object.keys(updates).forEach((key) => {
        budget[key] = updates[key];
    });

    await budget.save({ transaction: options.transaction });
    clearCache();

    return typeof budget.get === 'function' ? budget.get({ plain: true }) : { ...budget };
};

const saveBudget = async ({ id, ...data } = {}, options = {}) => {
    if (id) {
        const updated = await updateBudget(id, { id, ...data }, options);
        if (!updated) {
            const error = new Error('Orçamento não encontrado.');
            error.code = 'BUDGET_NOT_FOUND';
            throw error;
        }
        return updated;
    }

    return createBudget(data, options);
};

const deleteBudget = async ({ id, userId }, options = {}) => {
    const budget = await findBudgetById({ id, userId }, options);
    if (!budget) {
        const error = new Error('Orçamento não encontrado.');
        error.code = 'BUDGET_NOT_FOUND';
        throw error;
    }

    if (typeof budget.destroy === 'function') {
        await budget.destroy({ transaction: options.transaction });
    }

    clearCache();
};

const sumValues = (items, key) => items.reduce((total, item) => {
    const value = Number.parseFloat(item?.[key]);
    if (!Number.isFinite(value)) {
        return total;
    }
    return total + value;
}, 0);

const flattenThresholds = (items) => {
    const values = [];
    items.forEach((item) => {
        if (Array.isArray(item?.thresholds)) {
            item.thresholds.forEach((threshold) => {
                const normalized = normalizeNumber(threshold);
                if (normalized !== null) {
                    values.push(normalized);
                }
            });
        }
    });
    return values;
};

const getBudgetConsumptionSummary = async (budgetId, filters = {}) => {
    const overview = await financeReportingService.getBudgetSummaries(filters, {
        includeCategoryConsumption: true,
        budgetIds: [budgetId]
    });

    const summaries = Array.isArray(overview?.summaries)
        ? overview.summaries.filter((item) => normalizeId(item?.budgetId) === normalizeId(budgetId))
        : [];

    const totalLimit = sumValues(summaries, 'monthlyLimit');
    const totalConsumption = sumValues(summaries, 'consumption');
    const thresholds = flattenThresholds(summaries);

    const resolver = financeReportingService.utils?.resolveBudgetStatus;
    const statusMeta = typeof resolver === 'function'
        ? resolver(totalConsumption, totalLimit, thresholds)
        : { key: 'unknown', label: 'Indefinido' };

    return {
        budgetId: normalizeId(budgetId),
        totalLimit,
        totalConsumption,
        thresholds,
        status: statusMeta.key,
        statusLabel: statusMeta.label,
        statusMeta,
        months: Array.isArray(overview?.months) ? [...overview.months] : [],
        summaries,
        categoryConsumption: Array.isArray(overview?.categoryConsumption)
            ? [...overview.categoryConsumption]
            : []
    };
};

module.exports = {
    listBudgets,
    createBudget,
    updateBudget,
    saveBudget,
    deleteBudget,
    getBudgetConsumptionSummary,
    __testing: {
        clearCache
    }
};
