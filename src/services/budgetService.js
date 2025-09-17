const { Budget } = require('../../database/models');
const financeReportingService = require('./financeReportingService');

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;

const sanitizeNumericString = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    const stringValue = String(value).trim();
    if (!stringValue) {
        return null;
    }

    if (stringValue.includes('.') && stringValue.includes(',')) {
        return stringValue.replace(/\./g, '').replace(/,/g, '.');
    }

    if (stringValue.includes(',')) {
        return stringValue.replace(/,/g, '.');
    }

    return stringValue;
};

const parseDecimalValue = (value) => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
    }

    const sanitized = sanitizeNumericString(value);
    if (sanitized === null) {
        return null;
    }

    const parsed = Number.parseFloat(sanitized);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
};

const parseIntegerId = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
};

const normalizeReferenceMonth = (value) => {
    if (!value) {
        return null;
    }

    let reference;

    if (value instanceof Date) {
        reference = value;
    } else if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }

        if (/^\d{4}-\d{2}$/.test(trimmed)) {
            reference = new Date(`${trimmed}-01T00:00:00Z`);
        } else {
            reference = new Date(trimmed);
        }
    } else if (typeof value === 'number') {
        reference = new Date(value);
    }

    if (!(reference instanceof Date) || Number.isNaN(reference.getTime())) {
        return null;
    }

    const normalized = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
    return normalized.toISOString().slice(0, 10);
};

const normalizeThresholds = (value) => {
    if (value === undefined || value === null) {
        return [];
    }

    const list = Array.isArray(value)
        ? value
        : String(value)
            .split(/[;,\s]+/)
            .map((item) => item.trim())
            .filter((item) => item.length);

    const normalized = list
        .map((item) => parseDecimalValue(item))
        .filter((item) => item !== null && item > 0);

    if (!normalized.length) {
        return [];
    }

    const unique = Array.from(new Set(normalized.map((item) => Number(item.toFixed(2)))));
    unique.sort((a, b) => a - b);
    return unique;
};

const buildUserFilter = (userId) => {
    const parsed = parseIntegerId(userId);
    if (parsed === null) {
        return {};
    }
    return { userId: parsed };
};

const buildCategoryFilter = (financeCategoryId) => {
    const parsed = parseIntegerId(financeCategoryId);
    if (parsed === null) {
        return {};
    }
    return { financeCategoryId: parsed };
};

const toNumber = (value) => {
    if (value === null || value === undefined) {
        return 0;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const roundCurrency = (value) => {
    const numeric = toNumber(value);
    return Number(numeric.toFixed(2));
};

const getComparableId = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
        return numeric;
    }
    return String(value);
};

const fallbackNormalizeThresholdList = (list) => {
    if (!Array.isArray(list)) {
        return [];
    }

    const normalized = list
        .map((item) => {
            const numeric = Number(item);
            if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1) {
                return null;
            }
            return Number(numeric.toFixed(4));
        })
        .filter((item) => item !== null);

    const unique = Array.from(new Set(normalized));
    unique.sort((a, b) => a - b);
    return unique;
};

const buildDefaultStatusMeta = (key = 'healthy') => {
    const utils = financeReportingService?.utils;
    const meta = utils?.DEFAULT_STATUS_META?.[key];
    if (meta) {
        return { ...meta };
    }

    const fallbacks = {
        healthy: { key: 'healthy', label: 'Consumo saudável' },
        caution: { key: 'caution', label: 'Consumo moderado' },
        warning: { key: 'warning', label: 'Atenção ao consumo' },
        critical: { key: 'critical', label: 'Limite excedido' }
    };

    return { ...(fallbacks[key] || fallbacks.healthy) };
};

const fallbackResolveBudgetStatus = (consumption, limit, thresholds = []) => {
    const safeLimit = toNumber(limit);
    const safeConsumption = toNumber(consumption);
    const ratio = safeLimit > 0 ? safeConsumption / safeLimit : 0;
    const normalizedThresholds = fallbackNormalizeThresholdList(thresholds);

    if (safeLimit > 0 && safeConsumption >= safeLimit) {
        return buildDefaultStatusMeta('critical');
    }

    if (normalizedThresholds.length) {
        const warningThreshold = normalizedThresholds[normalizedThresholds.length - 1];
        const cautionThreshold = normalizedThresholds.find((value) => value < warningThreshold) ?? normalizedThresholds[0];

        if (Number.isFinite(warningThreshold) && ratio >= warningThreshold) {
            return buildDefaultStatusMeta('warning');
        }

        if (Number.isFinite(cautionThreshold) && ratio >= cautionThreshold) {
            return buildDefaultStatusMeta('caution');
        }
    }

    if (ratio >= 0.9) {
        return buildDefaultStatusMeta('warning');
    }

    if (ratio >= 0.6) {
        return buildDefaultStatusMeta('caution');
    }

    return buildDefaultStatusMeta('healthy');
};

const resolveTotalItems = (count) => {
    if (typeof count === 'number') {
        return Number.isFinite(count) ? count : 0;
    }

    if (Array.isArray(count)) {
        return count.length;
    }

    const parsed = Number.parseInt(count, 10);
    return Number.isFinite(parsed) ? parsed : 0;
};

const budgetListCache = new Map();

const buildCacheKey = (filters, pagination) => JSON.stringify({
    userId: parseIntegerId(filters?.userId),
    financeCategoryId: parseIntegerId(filters?.financeCategoryId),
    page: pagination.page,
    pageSize: pagination.pageSize
});

const normalizePaginationOptions = (options = {}) => {
    const pageParsed = Number.parseInt(options.page ?? options.currentPage ?? DEFAULT_PAGE, 10);
    const pageSizeParsed = Number.parseInt(options.pageSize ?? options.limit ?? DEFAULT_PAGE_SIZE, 10);

    const page = Number.isFinite(pageParsed) && pageParsed > 0 ? pageParsed : DEFAULT_PAGE;
    const pageSize = Number.isFinite(pageSizeParsed) && pageSizeParsed > 0 ? pageSizeParsed : DEFAULT_PAGE_SIZE;

    return { page, pageSize };
};

const computePagination = (page, pageSize, totalItems) => ({
    page,
    pageSize,
    totalItems,
    totalPages: pageSize > 0 ? Math.ceil(totalItems / pageSize) : 0
});

const getCachedResult = (key) => budgetListCache.get(key) || null;

const setCacheResult = (key, value) => {
    budgetListCache.set(key, value);
    return value;
};

const clearCache = () => {
    budgetListCache.clear();
};

const listBudgets = async (filters = {}, options = {}) => {
    const pagination = normalizePaginationOptions(options);
    const cacheKey = buildCacheKey(filters, pagination);
    const cached = getCachedResult(cacheKey);
    if (cached) {
        return cached;
    }

    const where = {
        ...buildUserFilter(filters.userId),
        ...buildCategoryFilter(filters.financeCategoryId)
    };

    try {
        const { rows, count } = await Budget.findAndCountAll({
            where,
            limit: pagination.pageSize,
            offset: (pagination.page - 1) * pagination.pageSize,
            order: [['referenceMonth', 'DESC'], ['financeCategoryId', 'ASC']]
        });

        const data = Array.isArray(rows)
            ? rows.map((row) => (typeof row?.get === 'function' ? row.get({ plain: true }) : row))
            : [];

        const totalItems = resolveTotalItems(count);
        const result = {
            data,
            pagination: computePagination(pagination.page, pagination.pageSize, totalItems)
        };

        return setCacheResult(cacheKey, result);
    } catch (error) {
        const message = String(error?.message || error).toLowerCase();
        if (message.includes('no such table') && message.includes('budget')) {
            const emptyResult = {
                data: [],
                pagination: computePagination(pagination.page, pagination.pageSize, 0)
            };
            return setCacheResult(cacheKey, emptyResult);
        }
        throw error;
    }
};

const normalizeBudgetCreationPayload = (data = {}) => {
    const payload = {};

    const userId = parseIntegerId(data.userId);
    if (userId !== null) {
        payload.userId = userId;
    }

    const financeCategoryId = parseIntegerId(data.financeCategoryId);
    if (financeCategoryId !== null) {
        payload.financeCategoryId = financeCategoryId;
    }

    const monthlyLimit = parseDecimalValue(data.monthlyLimit);
    if (monthlyLimit !== null) {
        payload.monthlyLimit = monthlyLimit;
    }

    payload.thresholds = normalizeThresholds(data.thresholds);

    const referenceMonth = normalizeReferenceMonth(data.referenceMonth);
    if (referenceMonth !== null) {
        payload.referenceMonth = referenceMonth;
    }

    return payload;
};

const normalizeBudgetUpdatePayload = (data = {}) => {
    const updates = {};

    if (Object.prototype.hasOwnProperty.call(data, 'userId')) {
        const userId = parseIntegerId(data.userId);
        if (userId !== null) {
            updates.userId = userId;
        }
    }

    if (Object.prototype.hasOwnProperty.call(data, 'financeCategoryId')) {
        const financeCategoryId = parseIntegerId(data.financeCategoryId);
        if (financeCategoryId !== null) {
            updates.financeCategoryId = financeCategoryId;
        }
    }

    if (Object.prototype.hasOwnProperty.call(data, 'monthlyLimit')) {
        const monthlyLimit = parseDecimalValue(data.monthlyLimit);
        if (monthlyLimit !== null) {
            updates.monthlyLimit = monthlyLimit;
        }
    }

    if (Object.prototype.hasOwnProperty.call(data, 'thresholds')) {
        updates.thresholds = normalizeThresholds(data.thresholds);
    }

    if (Object.prototype.hasOwnProperty.call(data, 'referenceMonth')) {
        updates.referenceMonth = normalizeReferenceMonth(data.referenceMonth);
    }

    return updates;
};

const createBudget = async (data = {}, options = {}) => {
    const payload = normalizeBudgetCreationPayload(data);
    const budget = await Budget.create(payload, options);
    clearCache();
    return typeof budget?.get === 'function' ? budget.get({ plain: true }) : budget;
};

const updateBudget = async (budgetId, data = {}, options = {}) => {
    const transaction = options?.transaction;
    const budget = await Budget.findByPk(budgetId, { transaction });
    if (!budget) {
        return null;
    }

    const updates = normalizeBudgetUpdatePayload(data);
    Object.keys(updates).forEach((key) => {
        budget[key] = updates[key];
    });

    await budget.save({ transaction });
    clearCache();
    return typeof budget.get === 'function' ? budget.get({ plain: true }) : budget;
};

const findBudgetById = async ({ id, userId }, options = {}) => {
    const where = { id, ...buildUserFilter(userId) };
    const queryOptions = { where };
    if (options?.transaction) {
        queryOptions.transaction = options.transaction;
    }
    return Budget.findOne(queryOptions);
};

const saveBudget = async (payload, options = {}) => {
    if (payload?.id) {
        const updated = await updateBudget(payload.id, payload, options);
        if (!updated) {
            const error = new Error('Orçamento não encontrado.');
            error.code = 'BUDGET_NOT_FOUND';
            throw error;
        }
        return updated;
    }

    return createBudget(payload, options);
};

const deleteBudget = async ({ id, userId } = {}, options = {}) => {
    const budget = await findBudgetById({ id, userId }, options);
    if (!budget) {
        const error = new Error('Orçamento não encontrado.');
        error.code = 'BUDGET_NOT_FOUND';
        throw error;
    }

    await budget.destroy({ transaction: options?.transaction });
    clearCache();
};

const getBudgetOverview = async (filters = {}, options = {}) => {
    const response = await financeReportingService.getBudgetSummaries(filters, {
        ...(options || {}),
        includeCategoryConsumption: true
    });

    if (response && typeof response === 'object' && !Array.isArray(response)) {
        return response;
    }

    return {
        summaries: Array.isArray(response) ? response : [],
        categoryConsumption: [],
        months: []
    };
};

const getBudgetConsumptionSummary = async (budgetId, filters = {}, options = {}) => {
    const overview = await getBudgetOverview(filters, options);
    const summaries = Array.isArray(overview?.summaries) ? overview.summaries : [];

    const targetId = getComparableId(budgetId);
    const relevantSummaries = summaries.filter((item) => getComparableId(item?.budgetId) === targetId);

    const utils = financeReportingService?.utils || {};
    const normalizeThresholdList = typeof utils.normalizeThresholdList === 'function'
        ? utils.normalizeThresholdList
        : fallbackNormalizeThresholdList;
    const resolveBudgetStatus = typeof utils.resolveBudgetStatus === 'function'
        ? utils.resolveBudgetStatus
        : fallbackResolveBudgetStatus;

    const totalLimit = roundCurrency(relevantSummaries.reduce((acc, item) => acc + toNumber(item?.monthlyLimit), 0));
    const totalConsumption = roundCurrency(relevantSummaries.reduce((acc, item) => acc + toNumber(item?.consumption), 0));
    const remaining = roundCurrency(totalLimit - totalConsumption);
    const ratio = totalLimit > 0 ? totalConsumption / totalLimit : 0;
    const percentage = roundCurrency(ratio * 100);

    const aggregatedThresholds = normalizeThresholdList(
        relevantSummaries.reduce((acc, item) => {
            if (Array.isArray(item?.thresholds)) {
                item.thresholds.forEach((threshold) => {
                    acc.push(threshold);
                });
            }
            return acc;
        }, [])
    );

    let statusMeta = resolveBudgetStatus(totalConsumption, totalLimit, aggregatedThresholds);

    if (!statusMeta || typeof statusMeta !== 'object') {
        statusMeta = buildDefaultStatusMeta('healthy');
    } else {
        statusMeta = { ...statusMeta };
    }

    if (ratio >= 0.9 && statusMeta.key !== 'critical' && statusMeta.key !== 'warning') {
        statusMeta = buildDefaultStatusMeta('warning');
    }

    const months = Array.isArray(overview?.months)
        ? overview.months
        : relevantSummaries.map((item) => item?.month).filter(Boolean);

    return {
        budgetId: relevantSummaries[0]?.budgetId ?? (targetId === null ? null : budgetId),
        totalLimit,
        totalConsumption,
        remaining,
        ratio,
        percentage,
        status: statusMeta.key || 'healthy',
        statusLabel: statusMeta.label || 'Consumo saudável',
        statusMeta,
        months
    };
};

const __testing = {
    toNumber,
    roundCurrency,
    getComparableId,
    fallbackNormalizeThresholdList,
    fallbackResolveBudgetStatus,
    buildDefaultStatusMeta,
    clearCache
};

module.exports = {
    listBudgets,
    saveBudget,
    createBudget,
    updateBudget,
    deleteBudget,
    getBudgetConsumptionSummary,
    getBudgetOverview,
    __testing
};
