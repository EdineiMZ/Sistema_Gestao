'use strict';

const financeReportingService = require('./financeReportingService');

const toFiniteNumber = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const toDecimal = (value, precision = 2) => {
    const parsed = toFiniteNumber(value);
    if (parsed === null) {
        return null;
    }
    return Number(parsed.toFixed(precision));
};

const normalizeThresholdValues = (thresholds = []) => {
    const source = Array.isArray(thresholds) ? thresholds : [thresholds];
    return source
        .map((value) => toFiniteNumber(value))
        .filter((value) => value !== null && value > 0)
        .map((value) => Number(value.toFixed(4)))
        .sort((a, b) => a - b);
};

const calculateConsumptionRatio = (totalSpent, monthlyLimit) => {
    const spent = toFiniteNumber(totalSpent);
    const limit = toFiniteNumber(monthlyLimit);

    if (limit === null || limit <= 0) {
        return null;
    }

    const safeSpent = spent !== null ? Math.max(spent, 0) : 0;
    const ratio = safeSpent / limit;

    if (!Number.isFinite(ratio)) {
        return null;
    }

    return Number(Math.max(ratio, 0).toFixed(4));
};

const resolveReachedThresholds = (ratio, thresholds = []) => {
    if (ratio === null) {
        return [];
    }

    const normalized = normalizeThresholdValues(thresholds);
    return normalized.filter((threshold) => ratio >= threshold);
};

const buildReferencePeriod = (monthKey, monthLabel) => {
    if (typeof monthKey !== 'string' || !/^\d{4}-\d{2}$/.test(monthKey)) {
        return {
            month: monthKey ?? null,
            label: monthLabel || null,
            startDate: null,
            endDate: null
        };
    }

    const [yearStr, monthStr] = monthKey.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return {
            month: monthKey,
            label: monthLabel || monthKey,
            startDate: null,
            endDate: null
        };
    }

    const startDate = `${yearStr}-${monthStr}-01`;
    const monthEnd = new Date(Date.UTC(year, month, 0));
    const endDate = [
        String(monthEnd.getUTCFullYear()).padStart(4, '0'),
        String(monthEnd.getUTCMonth() + 1).padStart(2, '0'),
        String(monthEnd.getUTCDate()).padStart(2, '0')
    ].join('-');

    return {
        month: monthKey,
        label: monthLabel || monthKey,
        startDate,
        endDate
    };
};

const buildCategoryTotals = (categoryAggregate) => {
    if (!categoryAggregate || typeof categoryAggregate !== 'object') {
        return null;
    }

    return {
        totalLimit: toDecimal(categoryAggregate.totalLimit),
        totalConsumption: toDecimal(categoryAggregate.totalConsumption),
        remaining: toDecimal(categoryAggregate.remaining),
        averagePercentage: toDecimal(categoryAggregate.averagePercentage),
        highestPercentage: toDecimal(categoryAggregate.highestPercentage),
        months: Number.isFinite(Number(categoryAggregate.months))
            ? Number(categoryAggregate.months)
            : null,
        status: categoryAggregate.status || null,
        statusLabel: categoryAggregate.statusLabel || null,
        statusMeta: categoryAggregate.statusMeta || null
    };
};

const buildAlertPayload = (summary, ratio, thresholdsReached, categoryTotals) => {
    const normalizedThresholds = normalizeThresholdValues(summary?.thresholds);
    const threshold = thresholdsReached.length
        ? thresholdsReached[thresholdsReached.length - 1]
        : null;
    const percentage = ratio !== null
        ? Number((ratio * 100).toFixed(2))
        : null;

    const monthlyLimit = toDecimal(summary?.monthlyLimit) ?? 0;
    const totalSpent = toDecimal(summary?.consumption) ?? 0;

    return {
        budgetId: summary?.budgetId ?? null,
        month: summary?.month || null,
        monthLabel: summary?.monthLabel || null,
        referencePeriod: buildReferencePeriod(summary?.month, summary?.monthLabel),
        monthlyLimit,
        totalSpent,
        remaining: toDecimal(summary?.remaining),
        consumptionRatio: ratio,
        consumptionPercentage: percentage,
        thresholds: normalizedThresholds,
        thresholdReached: threshold,
        thresholdsReached,
        status: summary?.status || null,
        statusLabel: summary?.statusLabel || null,
        statusMeta: summary?.statusMeta || null,
        category: {
            id: summary?.categoryId ?? null,
            name: summary?.categoryName || 'Sem categoria',
            slug: summary?.categorySlug || null,
            color: summary?.categoryColor || null
        },
        categoryTotals: buildCategoryTotals(categoryTotals)
    };
};

const loadActiveBudgetSummaries = async (filters = {}, options = {}) => {
    const mergedOptions = { includeCategoryConsumption: true, ...options };
    const rawResult = await financeReportingService.getBudgetSummaries(filters, mergedOptions);

    const summaries = Array.isArray(rawResult?.summaries)
        ? rawResult.summaries
        : Array.isArray(rawResult)
            ? rawResult
            : [];

    const activeBudgets = summaries.filter((summary) => {
        const limit = toFiniteNumber(summary?.monthlyLimit);
        return limit !== null && limit > 0;
    });

    return {
        activeBudgets,
        overview: rawResult,
        months: Array.isArray(rawResult?.months) ? rawResult.months : []
    };
};

const loadMonthlyConsumption = async (filters = {}, context = {}) => {
    const options = { ...(context?.options || {}) };
    if (context?.overview) {
        options.budgetOverview = context.overview;
    }

    const consumption = await financeReportingService.getCategoryConsumption(filters, options);
    return Array.isArray(consumption) ? consumption : [];
};

const getBudgetAlerts = async (filters = {}, options = {}) => {
    const { activeBudgets, overview } = await loadActiveBudgetSummaries(filters, options);

    if (!activeBudgets.length) {
        return [];
    }

    const categoryConsumption = await loadMonthlyConsumption(filters, { overview, options });
    const consumptionMap = new Map();

    categoryConsumption.forEach((item) => {
        const categoryId = Number(item?.categoryId);
        if (!Number.isFinite(categoryId)) {
            return;
        }
        consumptionMap.set(categoryId, item);
    });

    const alerts = [];

    activeBudgets.forEach((summary) => {
        const ratio = calculateConsumptionRatio(summary?.consumption, summary?.monthlyLimit);
        const thresholdsReached = resolveReachedThresholds(ratio, summary?.thresholds);

        if (!thresholdsReached.length) {
            return;
        }

        const categoryTotals = consumptionMap.get(Number(summary?.categoryId)) || null;
        alerts.push(buildAlertPayload(summary, ratio, thresholdsReached, categoryTotals));
    });

    return alerts.sort((a, b) => {
        const ratioA = toFiniteNumber(a?.consumptionRatio) || 0;
        const ratioB = toFiniteNumber(b?.consumptionRatio) || 0;
        return ratioB - ratioA;
    });
};

module.exports = {
    loadActiveBudgetSummaries,
    loadMonthlyConsumption,
    getBudgetAlerts,
    utils: {
        calculateConsumptionRatio,
        resolveReachedThresholds,
        buildReferencePeriod
    }
};
