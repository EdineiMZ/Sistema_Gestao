'use strict';

const { Op } = require('sequelize');
const models = require('../../database/models');

const {
    FinanceCategory,
    FinanceCategoryRate
} = models;

const RATE_PERIOD_TO_MONTH_FACTOR = {
    annual: 12,
    monthly: 1,
    quarterly: 3,
    weekly: 12 / 52,
    daily: 12 / 365
};

const CONTRIBUTION_FREQUENCY_TO_MONTH_FACTOR = {
    monthly: 1,
    quarterly: 1 / 3,
    yearly: 1 / 12,
    weekly: 52 / 12
};

const DEFAULT_OPTIONS = {
    defaultPeriodMonths: 12,
    defaultRatePeriod: 'annual',
    defaultContribution: 0,
    defaultContributionFrequency: 'monthly'
};

const sanitizeNumber = (value, fallback = 0) => {
    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return numeric;
};

const sanitizePlainText = (value, fallback = '') => {
    if (value === null || value === undefined) {
        return fallback;
    }

    const normalized = String(value).trim();
    return normalized ? normalized : fallback;
};

const normalizeCategoryId = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }

    return parsed;
};

const sanitizeCategoryList = (list) => {
    if (!Array.isArray(list)) {
        return [];
    }

    const seen = new Set();
    return list.reduce((acc, item) => {
        if (!item || typeof item !== 'object') {
            return acc;
        }

        const normalizedId = normalizeCategoryId(item.id);
        if (normalizedId === null || seen.has(normalizedId)) {
            return acc;
        }

        seen.add(normalizedId);
        acc.push({
            ...item,
            id: normalizedId,
            name: sanitizePlainText(item.name, 'Categoria sem nome'),
            color: sanitizePlainText(item.color, '#6c757d')
        });

        return acc;
    }, []);
};

const normalizeMonthlyRate = (rate, period, { compound } = {}) => {
    const normalizedPeriod = typeof period === 'string' ? period.toLowerCase() : 'annual';
    const factor = RATE_PERIOD_TO_MONTH_FACTOR[normalizedPeriod] ?? RATE_PERIOD_TO_MONTH_FACTOR.annual;
    const numericRate = sanitizeNumber(rate, 0);

    if (numericRate <= 0) {
        return 0;
    }

    if (compound) {
        if (factor === 1) {
            return numericRate;
        }

        if (normalizedPeriod === 'annual') {
            return Math.pow(1 + numericRate, 1 / 12) - 1;
        }

        if (factor > 1) {
            const periodsPerYear = 12 / factor;
            return Math.pow(1 + numericRate, factor / 12) - 1;
        }

        return Math.pow(1 + numericRate, factor) - 1;
    }

    if (factor === 0) {
        return numericRate;
    }

    if (normalizedPeriod === 'annual') {
        return numericRate / 12;
    }

    if (factor > 1) {
        return numericRate / factor;
    }

    return numericRate * factor;
};

const normalizeMonthlyContribution = (amount, frequency) => {
    const normalizedFrequency = typeof frequency === 'string' ? frequency.toLowerCase() : 'monthly';
    const factor = CONTRIBUTION_FREQUENCY_TO_MONTH_FACTOR[normalizedFrequency];
    const numericAmount = sanitizeNumber(amount, 0);

    if (!factor || factor === 1) {
        return numericAmount;
    }

    return numericAmount * factor;
};

const calculateSimpleInterestProjection = ({
    principal = 0,
    monthlyRate = 0,
    periods = 0,
    monthlyContribution = 0
}) => {
    const sanitizedPrincipal = Math.max(0, sanitizeNumber(principal, 0));
    const sanitizedRate = Math.max(0, sanitizeNumber(monthlyRate, 0));
    const sanitizedContribution = Math.max(0, sanitizeNumber(monthlyContribution, 0));
    const totalPeriods = Math.max(0, Math.floor(sanitizeNumber(periods, 0)));

    if (totalPeriods === 0) {
        const totalPrincipal = sanitizedPrincipal + (sanitizedContribution * totalPeriods);
        return {
            principal: sanitizedPrincipal,
            totalContributions: sanitizedContribution * totalPeriods,
            totalInterest: 0,
            futureValue: sanitizedPrincipal,
            monthlyRate: sanitizedRate,
            periods: totalPeriods,
            breakdown: []
        };
    }

    let totalPrincipal = sanitizedPrincipal;
    let totalInterest = sanitizedPrincipal * sanitizedRate * totalPeriods;
    const breakdown = [];

    for (let periodIndex = 1; periodIndex <= totalPeriods; periodIndex += 1) {
        if (sanitizedContribution > 0) {
            totalPrincipal += sanitizedContribution;
            const remainingPeriods = totalPeriods - periodIndex;
            totalInterest += sanitizedContribution * sanitizedRate * remainingPeriods;
        }

        const accumulated = sanitizedPrincipal + (sanitizedPrincipal * sanitizedRate * periodIndex);
        const contributionValue = sanitizedContribution * periodIndex;
        const interestFromContributions = sanitizedContribution > 0
            ? sanitizedContribution * sanitizedRate * ((periodIndex - 1) * periodIndex) / 2
            : 0;
        breakdown.push({
            period: periodIndex,
            accumulatedPrincipal: sanitizedPrincipal + contributionValue,
            accumulatedInterest: (sanitizedPrincipal * sanitizedRate * periodIndex) + interestFromContributions,
            accumulatedBalance: accumulated + contributionValue + interestFromContributions
        });
    }

    const totalContribution = sanitizedContribution * totalPeriods;
    const futureValue = totalPrincipal + totalInterest;

    return {
        principal: sanitizedPrincipal,
        totalContributions: totalContribution,
        totalInterest,
        futureValue,
        monthlyRate: sanitizedRate,
        periods: totalPeriods,
        breakdown
    };
};

const calculateCompoundInterestProjection = ({
    principal = 0,
    monthlyRate = 0,
    periods = 0,
    monthlyContribution = 0
}) => {
    const sanitizedPrincipal = Math.max(0, sanitizeNumber(principal, 0));
    const sanitizedRate = Math.max(0, sanitizeNumber(monthlyRate, 0));
    const totalPeriods = Math.max(0, Math.floor(sanitizeNumber(periods, 0)));
    const sanitizedContribution = Math.max(0, sanitizeNumber(monthlyContribution, 0));

    if (totalPeriods === 0) {
        return {
            principal: sanitizedPrincipal,
            totalContributions: 0,
            totalInterest: 0,
            futureValue: sanitizedPrincipal,
            monthlyRate: sanitizedRate,
            periods: totalPeriods,
            breakdown: []
        };
    }

    const growthFactor = sanitizedRate > 0 ? (1 + sanitizedRate) : 1;
    const futureValuePrincipal = sanitizedRate > 0
        ? sanitizedPrincipal * Math.pow(growthFactor, totalPeriods)
        : sanitizedPrincipal;

    let futureValueContributions = 0;
    if (sanitizedContribution > 0) {
        if (sanitizedRate === 0) {
            futureValueContributions = sanitizedContribution * totalPeriods;
        } else {
            futureValueContributions = sanitizedContribution * ((Math.pow(growthFactor, totalPeriods) - 1) / sanitizedRate);
        }
    }

    const futureValue = futureValuePrincipal + futureValueContributions;
    const totalContributions = sanitizedContribution * totalPeriods;
    const totalInterest = futureValue - (sanitizedPrincipal + totalContributions);

    const breakdown = [];
    let runningBalance = sanitizedPrincipal;
    for (let periodIndex = 1; periodIndex <= totalPeriods; periodIndex += 1) {
        runningBalance = runningBalance * growthFactor + sanitizedContribution;
        breakdown.push({
            period: periodIndex,
            accumulatedBalance: runningBalance,
            accumulatedPrincipal: sanitizedPrincipal + (sanitizedContribution * periodIndex)
        });
    }

    return {
        principal: sanitizedPrincipal,
        totalContributions,
        totalInterest,
        futureValue,
        monthlyRate: sanitizedRate,
        periods: totalPeriods,
        breakdown
    };
};

const normalizeRateRecord = (record) => {
    if (!record) {
        return null;
    }

    const plain = typeof record.get === 'function' ? record.get({ plain: true }) : record;
    return {
        id: plain.id || null,
        userId: plain.userId || null,
        financeCategoryId: plain.financeCategoryId || null,
        ratePeriod: typeof plain.ratePeriod === 'string' ? plain.ratePeriod.toLowerCase() : 'annual',
        simpleRate: sanitizeNumber(plain.simpleRate, 0),
        compoundRate: sanitizeNumber(plain.compoundRate, 0),
        contributionAmount: sanitizeNumber(plain.contributionAmount, 0),
        contributionFrequency: typeof plain.contributionFrequency === 'string'
            ? plain.contributionFrequency.toLowerCase()
            : 'monthly',
        periodMonths: plain.periodMonths ? Math.max(0, Math.floor(plain.periodMonths)) : null,
        notes: plain.notes || null,
        source: plain.userId ? 'user' : 'default'
    };
};

const fetchCategoryRateRecords = async ({ userId, categoryIds } = {}) => {
    if (!FinanceCategoryRate || typeof FinanceCategoryRate.findAll !== 'function') {
        return [];
    }

    const where = {};

    if (Array.isArray(categoryIds) && categoryIds.length) {
        where.financeCategoryId = { [Op.in]: Array.from(new Set(categoryIds)) };
    }

    if (userId) {
        where[Op.or] = [
            { userId },
            { userId: null }
        ];
    }

    const records = await FinanceCategoryRate.findAll({ where });
    return records.map(normalizeRateRecord).filter(Boolean);
};

const mergeRateConfigurations = (records = [], { defaultPeriodMonths }) => {
    const grouped = new Map();

    for (const record of records) {
        if (!record?.financeCategoryId) {
            continue;
        }

        const current = grouped.get(record.financeCategoryId);
        if (!current || (current.source !== 'user' && record.source === 'user')) {
            grouped.set(record.financeCategoryId, {
                ...record,
                periodMonths: record.periodMonths || defaultPeriodMonths
            });
        }
    }

    return grouped;
};

const fetchCategoryMetadata = async (categoryIds = []) => {
    if (!FinanceCategory || typeof FinanceCategory.findAll !== 'function' || !categoryIds.length) {
        return new Map();
    }

    const rows = await FinanceCategory.findAll({
        where: { id: { [Op.in]: Array.from(new Set(categoryIds)) } },
        attributes: ['id', 'name', 'color']
    });

    return rows.reduce((acc, category) => {
        const plain = typeof category.get === 'function' ? category.get({ plain: true }) : category;
        if (plain?.id) {
            acc.set(plain.id, {
                id: plain.id,
                name: plain.name,
                color: plain.color
            });
        }
        return acc;
    }, new Map());
};

const aggregateEntriesByCategory = (entries = []) => {
    return entries.reduce((acc, entry) => {
        const plain = typeof entry?.get === 'function' ? entry.get({ plain: true }) : entry;
        const categoryId = normalizeCategoryId(
            plain?.financeCategoryId
                ?? plain?.categoryId
                ?? plain?.category?.id
        );

        if (categoryId === null) {
            return acc;
        }

        const normalizedValue = sanitizeNumber(plain.value, 0);
        const sign = plain.type === 'payable' ? -1 : 1;
        const current = acc.get(categoryId) || { principal: 0, entries: [] };
        current.principal += Math.max(0, sign * normalizedValue);
        current.entries.push(plain);
        acc.set(categoryId, current);
        return acc;
    }, new Map());
};

const buildCategoryProjection = (categoryId, categoryMeta, rateConfig, aggregated, options) => {
    const principal = Math.max(0, sanitizeNumber(aggregated?.principal, 0));
    const ratePeriod = rateConfig?.ratePeriod || options.defaultRatePeriod;
    const periodMonths = rateConfig?.periodMonths || options.defaultPeriodMonths;
    const monthlyContribution = normalizeMonthlyContribution(
        rateConfig?.contributionAmount ?? options.defaultContribution,
        rateConfig?.contributionFrequency ?? options.defaultContributionFrequency
    );

    const simpleMonthlyRate = normalizeMonthlyRate(rateConfig?.simpleRate, ratePeriod, { compound: false });
    const compoundMonthlyRate = normalizeMonthlyRate(rateConfig?.compoundRate, ratePeriod, { compound: true });

    const simpleProjection = calculateSimpleInterestProjection({
        principal,
        monthlyRate: simpleMonthlyRate,
        periods: periodMonths,
        monthlyContribution
    });

    const compoundProjection = calculateCompoundInterestProjection({
        principal,
        monthlyRate: compoundMonthlyRate,
        periods: periodMonths,
        monthlyContribution
    });

    return {
        categoryId,
        categoryName: categoryMeta?.name || 'Categoria sem nome',
        color: categoryMeta?.color || '#6c757d',
        principal,
        rateSource: rateConfig?.source || 'default',
        periodMonths,
        monthlyContribution,
        simple: {
            ...simpleProjection,
            annualizedRate: simpleMonthlyRate * 12
        },
        compound: {
            ...compoundProjection,
            annualizedRate: Math.pow(1 + compoundMonthlyRate, 12) - 1
        }
    };
};

const simulateInvestmentProjections = async ({
    entries = [],
    userId = null,
    categories = [],
    filters = {},
    options = {}
} = {}) => {
    const mergedOptions = {
        ...DEFAULT_OPTIONS,
        ...options
    };

    const aggregatedEntries = aggregateEntriesByCategory(entries);
    const sanitizedCategories = sanitizeCategoryList(categories);
    const categoryIds = Array.from(new Set([
        ...Array.from(aggregatedEntries.keys()),
        ...sanitizedCategories.map((category) => category.id)
    ]));

    if (!categoryIds.length) {
        return {
            categories: [],
            totals: {
                principal: 0,
                contributions: 0,
                simpleFutureValue: 0,
                compoundFutureValue: 0,
                interestDelta: 0
            },
            options: mergedOptions,
            generatedAt: new Date().toISOString(),
            filters
        };
    }

    const [rateRecords, categoryMap] = await Promise.all([
        fetchCategoryRateRecords({ userId, categoryIds }),
        fetchCategoryMetadata(categoryIds)
    ]);

    const rateMap = mergeRateConfigurations(rateRecords, {
        defaultPeriodMonths: mergedOptions.defaultPeriodMonths
    });

    const results = [];
    let totalPrincipal = 0;
    let totalContributions = 0;
    let totalSimpleFuture = 0;
    let totalCompoundFuture = 0;

    for (const categoryId of categoryIds) {
        const aggregated = aggregatedEntries.get(categoryId) || { principal: 0 };
        const principal = Math.max(0, sanitizeNumber(aggregated.principal, 0));

        if (principal === 0) {
            continue;
        }

        const rateConfig = rateMap.get(categoryId) || null;
        const categoryMeta = categoryMap.get(categoryId)
            || sanitizedCategories.find((item) => item.id === categoryId)
            || null;

        const projection = buildCategoryProjection(
            categoryId,
            categoryMeta,
            rateConfig,
            aggregated,
            mergedOptions
        );

        totalPrincipal += projection.principal;
        totalContributions += projection.simple.totalContributions;
        totalSimpleFuture += projection.simple.futureValue;
        totalCompoundFuture += projection.compound.futureValue;
        results.push(projection);
    }

    const interestDelta = totalCompoundFuture - totalSimpleFuture;

    return {
        categories: results,
        totals: {
            principal: totalPrincipal,
            contributions: totalContributions,
            simpleFutureValue: totalSimpleFuture,
            compoundFutureValue: totalCompoundFuture,
            interestDelta
        },
        options: mergedOptions,
        generatedAt: new Date().toISOString(),
        filters
    };
};

const upsertCategoryRate = async ({ userId, financeCategoryId, ...payload }, options = {}) => {
    if (!FinanceCategoryRate || typeof FinanceCategoryRate.findOne !== 'function') {
        throw new Error('Configuração de taxas indisponível.');
    }

    const where = {
        userId: userId || null,
        financeCategoryId: financeCategoryId || null
    };

    const transaction = options.transaction;
    const existing = await FinanceCategoryRate.findOne({ where, transaction });

    const data = {
        userId: userId || null,
        financeCategoryId: financeCategoryId || null,
        ratePeriod: payload.ratePeriod || DEFAULT_OPTIONS.defaultRatePeriod,
        simpleRate: sanitizeNumber(payload.simpleRate, 0),
        compoundRate: sanitizeNumber(payload.compoundRate, 0),
        contributionAmount: sanitizeNumber(payload.contributionAmount, DEFAULT_OPTIONS.defaultContribution),
        contributionFrequency: payload.contributionFrequency || DEFAULT_OPTIONS.defaultContributionFrequency,
        periodMonths: payload.periodMonths || null,
        notes: payload.notes || null
    };

    if (existing) {
        await existing.update(data, { transaction });
        return normalizeRateRecord(existing);
    }

    const created = await FinanceCategoryRate.create({
        ...data,
        userId: data.userId,
        financeCategoryId: data.financeCategoryId
    }, { transaction });

    return normalizeRateRecord(created);
};

module.exports = {
    calculateSimpleInterestProjection,
    calculateCompoundInterestProjection,
    simulateInvestmentProjections,
    upsertCategoryRate,
    __testing: {
        normalizeMonthlyRate,
        normalizeMonthlyContribution,
        fetchCategoryRateRecords,
        mergeRateConfigurations,
        aggregateEntriesByCategory,
        buildCategoryProjection
    }
};
