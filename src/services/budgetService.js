const { Budget } = require('../../database/models');
const financeReportingService = require('./financeReportingService');

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const listCache = new Map();

const normalizeIntegerId = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const parsed = Number.parseInt(String(value).trim(), 10);
    return Number.isInteger(parsed) ? parsed : null;
};

const parseLocalizedNumber = (value) => {
    if (value === null || value === undefined || value === '') {
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

        const hasComma = trimmed.includes(',');
        const sanitized = hasComma
            ? trimmed.replace(/\./g, '').replace(',', '.')
            : trimmed;

        const parsed = Number.parseFloat(sanitized);
        return Number.isFinite(parsed) ? parsed : null;
    }

    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const normalizeAmount = (value) => {
    const numeric = parseLocalizedNumber(value);
    if (numeric === null) {
        return null;
    }
    return Number(numeric.toFixed(2));
};

const normalizeThresholdValues = (value) => {
    if (value === null || value === undefined) {
        return [];
    }

    const rawList = Array.isArray(value) ? value : [value];
    const uniqueMap = new Map();

    rawList.forEach((item) => {
        const normalized = normalizeAmount(item);
        if (normalized !== null && normalized > 0) {
            const key = normalized.toFixed(2);
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, normalized);
            }
        }
    });

    const normalizedList = Array.from(uniqueMap.values());
    normalizedList.sort((a, b) => a - b);
    return normalizedList;
};

const normalizeReferenceMonth = (value) => {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        if (!Number.isFinite(value.getTime())) {
            return null;
        }
        const year = value.getUTCFullYear();
        const month = value.getUTCMonth() + 1;
        return `${year}-${String(month).padStart(2, '0')}-01`;
    }

    const stringValue = String(value).trim();
    if (!stringValue) {
        return null;
    }

    if (/^\d{4}-\d{2}$/.test(stringValue)) {
        return `${stringValue}-01`;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
        return `${stringValue.slice(0, 7)}-01`;
    }

    const parsed = new Date(stringValue);
    if (!Number.isFinite(parsed.getTime())) {
        return null;
    }

    const year = parsed.getUTCFullYear();
    const month = parsed.getUTCMonth() + 1;
    return `${year}-${String(month).padStart(2, '0')}-01`;
};

const normalizeBudgetPayload = (payload = {}) => {
    const normalized = { ...payload };

    if ('monthlyLimit' in payload) {
        const monthlyLimit = normalizeAmount(payload.monthlyLimit);
        if (monthlyLimit !== null) {
            normalized.monthlyLimit = monthlyLimit;
        } else {
            delete normalized.monthlyLimit;
        }
    }

    if ('thresholds' in payload) {
        normalized.thresholds = normalizeThresholdValues(payload.thresholds);
    }

    if ('referenceMonth' in payload) {
        normalized.referenceMonth = normalizeReferenceMonth(payload.referenceMonth);
    }

    if ('userId' in payload) {
        const userId = normalizeIntegerId(payload.userId);
        if (userId !== null) {
            normalized.userId = userId;
        } else {
            delete normalized.userId;
        }
    }

    if ('financeCategoryId' in payload) {
        const financeCategoryId = normalizeIntegerId(payload.financeCategoryId);
        if (financeCategoryId !== null) {
            normalized.financeCategoryId = financeCategoryId;
        } else {
            delete normalized.financeCategoryId;
        }
    }

    if ('id' in payload) {
        const id = normalizeIntegerId(payload.id);
        normalized.id = id;
    }

    return normalized;
};

const getPlainRecord = (instance) => {
    if (instance && typeof instance.get === 'function') {
        return instance.get({ plain: true });
    }
    return instance;
};

const normalizePaginationOptions = (options = {}) => {
    const rawPage = Number.parseInt(options.page, 10);
    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : DEFAULT_PAGE;

    const rawPageSize = Number.parseInt(options.pageSize, 10);
    const normalizedSize = Number.isInteger(rawPageSize) && rawPageSize > 0 ? rawPageSize : DEFAULT_PAGE_SIZE;
    const pageSize = Math.min(normalizedSize, MAX_PAGE_SIZE);

    return { page, pageSize };
};

const buildPagination = (page, pageSize, totalItems) => {
    const safePageSize = pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
    const totalPages = safePageSize > 0 ? Math.ceil(totalItems / safePageSize) : 0;

    return {
        page,
        pageSize: safePageSize,
        totalItems,
        totalPages
    };
};

const buildListFilters = ({ userId, financeCategoryId } = {}) => {
    const filters = {};

    const normalizedUserId = normalizeIntegerId(userId);
    if (normalizedUserId !== null) {
        filters.userId = normalizedUserId;
    }

    const normalizedCategoryId = normalizeIntegerId(financeCategoryId);
    if (normalizedCategoryId !== null) {
        filters.financeCategoryId = normalizedCategoryId;
    }

    return filters;
};

const buildCacheKey = (filters, pagination) => JSON.stringify({ filters, pagination });

const isMissingBudgetTableError = (error) => {
    const message = String(
        error?.original?.message
        || error?.parent?.message
        || error?.message
        || ''
    ).toLowerCase();

    return message.includes('no such table') && message.includes('budget');
};

const clearListBudgetsCache = () => {
    listCache.clear();
};

const listBudgets = async ({ userId, financeCategoryId } = {}, options = {}) => {
    const filters = buildListFilters({ userId, financeCategoryId });
    const pagination = normalizePaginationOptions(options);
    const cacheKey = buildCacheKey(filters, pagination);

    if (listCache.has(cacheKey)) {
        return listCache.get(cacheKey);
    }

    try {
        const { rows = [], count = 0 } = await Budget.findAndCountAll({
            where: filters,
            order: [['referenceMonth', 'DESC'], ['financeCategoryId', 'ASC']],
            offset: (pagination.page - 1) * pagination.pageSize,
            limit: pagination.pageSize
        });

        const data = rows.map(getPlainRecord);
        const result = {
            data,
            pagination: buildPagination(pagination.page, pagination.pageSize, count)
        };

        listCache.set(cacheKey, result);
        return result;
    } catch (error) {
        if (isMissingBudgetTableError(error)) {
            const emptyResult = {
                data: [],
                pagination: buildPagination(pagination.page, pagination.pageSize, 0)
            };
            listCache.set(cacheKey, emptyResult);
            return emptyResult;
        }
        throw error;
    }
};

const findBudgetById = async ({ id, userId }, options = {}) => {
    const where = { id };

    const normalizedUserId = normalizeIntegerId(userId);
    if (normalizedUserId !== null) {
        where.userId = normalizedUserId;
    }

    return Budget.findOne({ where, ...options });
};

const createBudget = async (payload = {}, options = {}) => {
    const normalizedPayload = normalizeBudgetPayload(payload);
    const created = await Budget.create(normalizedPayload, options);
    clearListBudgetsCache();
    return getPlainRecord(created);
};

const updateBudget = async (budgetId, updates = {}, options = {}) => {
    const transactionOptions = { transaction: options?.transaction };
    const budget = await Budget.findByPk(budgetId, transactionOptions);

    if (!budget) {
        return null;
    }

    if (updates.monthlyLimit !== undefined) {
        const normalized = normalizeAmount(updates.monthlyLimit);
        if (normalized !== null) {
            budget.monthlyLimit = normalized;
        }
    }

    if (updates.thresholds !== undefined) {
        budget.thresholds = normalizeThresholdValues(updates.thresholds);
    }

    if (updates.referenceMonth !== undefined) {
        budget.referenceMonth = normalizeReferenceMonth(updates.referenceMonth);
    }

    await budget.save(transactionOptions);
    clearListBudgetsCache();
    return getPlainRecord(budget);
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
        clearListBudgetsCache();
        return budget;
    }

    const created = await Budget.create({
        monthlyLimit,
        thresholds,
        referenceMonth,
        userId,
        financeCategoryId
    });
    clearListBudgetsCache();
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
    clearListBudgetsCache();
};

const sumNumeric = (list, key) => list.reduce((total, item) => {
    const value = Number.parseFloat(item?.[key]);
    return total + (Number.isFinite(value) ? value : 0);
}, 0);

const collectThresholds = (summaries) => {
    const values = new Map();
    summaries.forEach((summary) => {
        if (!Array.isArray(summary?.thresholds)) {
            return;
        }

        summary.thresholds.forEach((threshold) => {
            const amount = normalizeAmount(threshold);
            if (amount !== null && amount > 0) {
                const key = amount.toFixed(2);
                if (!values.has(key)) {
                    values.set(key, amount);
                }
            }
        });
    });

    const result = Array.from(values.values());
    result.sort((a, b) => a - b);
    return result;
};

const getBudgetConsumptionSummary = async (budgetId, filters = {}, options = {}) => {
    const requestOptions = {
        ...options,
        includeCategoryConsumption: true,
        budgetId
    };

    const overview = await financeReportingService.getBudgetSummaries(filters, requestOptions);
    const summaries = Array.isArray(overview?.summaries) ? overview.summaries : [];
    const filteredSummaries = summaries.filter((summary) => summary?.budgetId === budgetId);

    const totalLimit = sumNumeric(filteredSummaries, 'monthlyLimit');
    const totalConsumption = sumNumeric(filteredSummaries, 'consumption');
    const thresholds = collectThresholds(filteredSummaries);

    const resolver = financeReportingService?.utils?.resolveBudgetStatus;
    const statusMeta = typeof resolver === 'function'
        ? resolver(totalConsumption, totalLimit, thresholds)
        : null;

    return {
        budgetId,
        totalLimit,
        totalConsumption,
        status: statusMeta?.key || null,
        thresholds,
        months: Array.isArray(overview?.months) ? overview.months : [],
        categoryConsumption: Array.isArray(overview?.categoryConsumption)
            ? overview.categoryConsumption
            : [],
        summaries: filteredSummaries
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
        clearCache: clearListBudgetsCache
    }
};
