const { Budget } = require('../../database/models');
const financeReportingService = require('./financeReportingService');

const budgetListCache = new Map();

const toPlainBudget = (budget) => {
    if (!budget) {
        return null;
    }
    return typeof budget.get === 'function' ? budget.get({ plain: true }) : budget;
};

const normalizeId = (value) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const numeric = Number.parseInt(value, 10);
    return Number.isInteger(numeric) ? numeric : null;
};

const normalizeMonthlyLimit = (value) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return Number(value.toFixed(2));
    }

    if (typeof value === 'string') {
        const cleaned = value.trim().replace(/\./g, '').replace(',', '.');
        if (!cleaned) {
            return null;
        }
        const parsed = Number.parseFloat(cleaned);
        return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
    }

    return null;
};

const normalizeThresholds = (value) => {
    if (value === undefined || value === null) {
        return [];
    }

    const list = Array.isArray(value) ? value : [value];
    const normalized = list
        .map((item) => {
            if (item === undefined || item === null) {
                return null;
            }
            if (typeof item === 'number' && Number.isFinite(item)) {
                return Number(item.toFixed(2));
            }
            if (typeof item === 'string') {
                const trimmed = item.trim();
                if (!trimmed) {
                    return null;
                }
                const parsed = Number.parseFloat(trimmed.replace(',', '.'));
                return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
            }
            return null;
        })
        .filter((item) => item !== null);

    if (!normalized.length) {
        return [];
    }

    const unique = Array.from(new Set(normalized));
    unique.sort((a, b) => a - b);
    return unique;
};

const normalizeReferenceMonth = (value) => {
    if (!value) {
        return null;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }
        if (/^\d{4}-\d{2}$/.test(trimmed)) {
            return `${trimmed}-01`;
        }
        return trimmed;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
            return date.toISOString().slice(0, 10);
        }
    }

    return null;
};

const clearCache = () => {
    budgetListCache.clear();
};

const buildCacheKey = (filters, pagination) => {
    const normalizedFilters = {
        userId: normalizeId(filters.userId),
        financeCategoryId: normalizeId(filters.financeCategoryId)
    };

    return JSON.stringify({ filters: normalizedFilters, pagination });
};

const getPaginationSettings = (options = {}) => {
    const parsedPage = Number.parseInt(options.page, 10);
    const parsedPageSize = Number.parseInt(options.pageSize, 10);

    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const pageSize = Number.isInteger(parsedPageSize) && parsedPageSize > 0 ? parsedPageSize : 25;

    return { page, pageSize };
};

const buildWhereClause = (filters = {}) => {
    const where = {};

    const normalizedUserId = normalizeId(filters.userId);
    if (normalizedUserId !== null) {
        where.userId = normalizedUserId;
    }

    const normalizedCategoryId = normalizeId(filters.financeCategoryId);
    if (normalizedCategoryId !== null) {
        where.financeCategoryId = normalizedCategoryId;
    }

    return where;
};

const buildEmptyResult = (pagination) => ({
    data: [],
    pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalItems: 0,
        totalPages: 0
    }
});

const listBudgets = async (filters = {}, paginationOptions = {}) => {
    const pagination = getPaginationSettings(paginationOptions);
    const cacheKey = buildCacheKey(filters, pagination);

    if (budgetListCache.has(cacheKey)) {
        return budgetListCache.get(cacheKey);
    }

    const where = buildWhereClause(filters);
    const offset = (pagination.page - 1) * pagination.pageSize;

    try {
        const { rows, count } = await Budget.findAndCountAll({
            where,
            offset,
            limit: pagination.pageSize,
            order: [
                ['referenceMonth', 'DESC'],
                ['financeCategoryId', 'ASC']
            ]
        });

        const data = Array.isArray(rows) ? rows.map(toPlainBudget).filter(Boolean) : [];
        const totalPages = pagination.pageSize > 0 ? Math.ceil(count / pagination.pageSize) : 0;

        const result = {
            data,
            pagination: {
                page: pagination.page,
                pageSize: pagination.pageSize,
                totalItems: count,
                totalPages: Number.isFinite(totalPages) ? totalPages : 0
            }
        };

        budgetListCache.set(cacheKey, result);
        return result;
    } catch (error) {
        if (typeof error?.message === 'string' && /no such table/i.test(error.message)) {
            const emptyResult = buildEmptyResult(pagination);
            budgetListCache.set(cacheKey, emptyResult);
            return emptyResult;
        }
        throw error;
    }
};

const applyBudgetUpdates = (budget, updates) => {
    if (updates.monthlyLimit !== undefined) {
        budget.monthlyLimit = normalizeMonthlyLimit(updates.monthlyLimit);
    }

    if (updates.thresholds !== undefined) {
        budget.thresholds = normalizeThresholds(updates.thresholds);
    }

    if (updates.referenceMonth !== undefined) {
        budget.referenceMonth = normalizeReferenceMonth(updates.referenceMonth);
    }

    if (updates.userId !== undefined) {
        budget.userId = normalizeId(updates.userId);
    }

    if (updates.financeCategoryId !== undefined) {
        budget.financeCategoryId = normalizeId(updates.financeCategoryId);
    }
};

const buildQueryOptions = (options = {}) => {
    const queryOptions = { ...options };
    if (!Object.prototype.hasOwnProperty.call(queryOptions, 'transaction')) {
        queryOptions.transaction = options.transaction;
    }
    return queryOptions;
};

const createBudget = async (input = {}, options = {}) => {
    const normalizedUserId = normalizeId(input.userId);
    const normalizedCategoryId = normalizeId(input.financeCategoryId);
    const normalizedMonthlyLimit = normalizeMonthlyLimit(input.monthlyLimit);
    const normalizedThresholds = normalizeThresholds(input.thresholds);
    const normalizedReferenceMonth = normalizeReferenceMonth(input.referenceMonth);

    const payload = {};
    if (normalizedUserId !== null) {
        payload.userId = normalizedUserId;
    }
    if (normalizedCategoryId !== null) {
        payload.financeCategoryId = normalizedCategoryId;
    }
    if (normalizedMonthlyLimit !== null) {
        payload.monthlyLimit = normalizedMonthlyLimit;
    }
    if (normalizedThresholds.length) {
        payload.thresholds = normalizedThresholds;
    }
    if (normalizedReferenceMonth) {
        payload.referenceMonth = normalizedReferenceMonth;
    }

    const queryOptions = buildQueryOptions(options);
    const budget = await Budget.create(payload, queryOptions);
    clearCache();
    return toPlainBudget(budget);
};

const updateBudget = async (id, updates = {}, options = {}) => {
    const normalizedId = normalizeId(id);
    if (normalizedId === null) {
        return null;
    }

    const queryOptions = buildQueryOptions(options);
    const budget = await Budget.findByPk(normalizedId, queryOptions);
    if (!budget) {
        return null;
    }

    applyBudgetUpdates(budget, updates);
    await budget.save(queryOptions);
    clearCache();
    return toPlainBudget(budget);
};

const getBudgetConsumptionSummary = async (budgetId, filters = {}, options = {}) => {
    const normalizedBudgetId = normalizeId(budgetId);
    if (normalizedBudgetId === null) {
        return null;
    }

    const overview = await financeReportingService.getBudgetSummaries(filters, {
        ...options,
        includeCategoryConsumption: true
    });

    const summaries = Array.isArray(overview?.summaries)
        ? overview.summaries.filter((item) => normalizeId(item.budgetId) === normalizedBudgetId)
        : [];

    if (!summaries.length) {
        return {
            budgetId: normalizedBudgetId,
            totalLimit: 0,
            totalConsumption: 0,
            remaining: 0,
            status: 'ok',
            months: Array.isArray(overview?.months) ? overview.months : [],
            categoryConsumption: Array.isArray(overview?.categoryConsumption) ? overview.categoryConsumption : []
        };
    }

    const totals = summaries.reduce(
        (acc, item) => {
            const monthlyLimit = Number(item.monthlyLimit || 0);
            const consumption = Number(item.consumption || 0);

            acc.totalLimit += Number.isFinite(monthlyLimit) ? monthlyLimit : 0;
            acc.totalConsumption += Number.isFinite(consumption) ? consumption : 0;

            const thresholds = Array.isArray(item.thresholds) ? item.thresholds : [];
            thresholds.forEach((threshold) => {
                const numeric = Number(threshold);
                if (Number.isFinite(numeric) && numeric > acc.highestThreshold) {
                    acc.highestThreshold = numeric;
                }
            });

            return acc;
        },
        { totalLimit: 0, totalConsumption: 0, highestThreshold: 0 }
    );

    let status = 'ok';
    if (totals.totalLimit > 0 && totals.totalConsumption >= totals.totalLimit) {
        status = 'alert';
    } else if (totals.highestThreshold > 0 && totals.totalConsumption >= totals.highestThreshold) {
        status = 'warning';
    }

    const remaining = totals.totalLimit - totals.totalConsumption;

    return {
        budgetId: normalizedBudgetId,
        totalLimit: Number(totals.totalLimit.toFixed(2)),
        totalConsumption: Number(totals.totalConsumption.toFixed(2)),
        remaining: Number(remaining.toFixed(2)),
        status,
        months: Array.isArray(overview?.months) ? overview.months : [],
        categoryConsumption: Array.isArray(overview?.categoryConsumption) ? overview.categoryConsumption : []
    };
};

const findBudgetById = async ({ id, userId }) => {
    const where = {};

    const normalizedId = normalizeId(id);
    if (normalizedId !== null) {
        where.id = normalizedId;
    }

    const normalizedUserId = normalizeId(userId);
    if (normalizedUserId !== null) {
        where.userId = normalizedUserId;
    }

    return Budget.findOne({ where });
};

const saveBudget = async ({ id, monthlyLimit, thresholds, referenceMonth, userId, financeCategoryId }) => {
    if (id) {
        const budget = await findBudgetById({ id, userId });
        if (!budget) {
            const error = new Error('Orçamento não encontrado.');
            error.code = 'BUDGET_NOT_FOUND';
            throw error;
        }

        budget.monthlyLimit = monthlyLimit;
        budget.thresholds = thresholds;
        budget.referenceMonth = referenceMonth;
        budget.userId = userId;
        budget.financeCategoryId = financeCategoryId;

        await budget.save();
        clearCache();
        return budget;
    }

    const created = await Budget.create({
        monthlyLimit,
        thresholds,
        referenceMonth,
        userId,
        financeCategoryId
    });

    clearCache();
    return created;
};

const deleteBudget = async ({ id, userId }) => {
    const budget = await findBudgetById({ id, userId });
    if (!budget) {
        const error = new Error('Orçamento não encontrado.');
        error.code = 'BUDGET_NOT_FOUND';
        throw error;
    }

    await budget.destroy();
    clearCache();
};

module.exports = {
    listBudgets,
    createBudget,
    updateBudget,
    getBudgetConsumptionSummary,
    saveBudget,
    deleteBudget,
    __testing: {
        clearCache
    }
};
