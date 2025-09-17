'use strict';

const { FinanceEntry, FinanceGoal, Sequelize } = require('../../database/models');
const {
    FINANCE_RECURRING_INTERVALS,
    FINANCE_RECURRING_INTERVAL_VALUES,
    FINANCE_RECURRING_INTERVAL_LABEL_TO_VALUE,
    normalizeRecurringInterval
} = require('../constants/financeRecurringIntervals');

const { Op } = Sequelize;

const FINANCE_TYPES = ['payable', 'receivable'];
const FINANCE_STATUSES = ['pending', 'paid', 'overdue', 'cancelled'];
const DEFAULT_PROJECTION_MONTHS = 6;
const MAX_PROJECTION_MONTHS = 24;

const toNullableNumber = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const toNumber = (value) => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const roundNumber = (value) => {
    const parsed = toNumber(value);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
};

const roundNullable = (value) => {
    const parsed = toNullableNumber(value);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
};

const parseDateCandidate = (value) => {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value : null;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const fromNumber = new Date(value);
        return Number.isFinite(fromNumber.getTime()) ? fromNumber : null;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }

        if (/^\d{4}-\d{2}$/.test(trimmed)) {
            const monthDate = new Date(`${trimmed}-01T00:00:00Z`);
            return Number.isFinite(monthDate.getTime()) ? monthDate : null;
        }

        const parsed = new Date(trimmed);
        return Number.isFinite(parsed.getTime()) ? parsed : null;
    }

    return null;
};

const parseProjectionMonths = (value) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_PROJECTION_MONTHS;
    }
    return Math.min(parsed, MAX_PROJECTION_MONTHS);
};

const isValidISODate = (value) => {
    if (typeof value !== 'string') {
        return false;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const time = Date.parse(value);
    return Number.isFinite(time);
};

const buildDateFilter = ({ startDate, endDate } = {}) => {
    const hasStart = isValidISODate(startDate);
    const hasEnd = isValidISODate(endDate);

    if (!hasStart && !hasEnd) {
        return undefined;
    }

    const range = {};
    if (hasStart) {
        range[Op.gte] = startDate;
    }
    if (hasEnd) {
        range[Op.lte] = endDate;
    }
    return range;
};

const createEmptyStatusSummary = () => {
    return FINANCE_TYPES.reduce((acc, type) => {
        acc[type] = FINANCE_STATUSES.reduce((statusAcc, status) => {
            statusAcc[status] = 0;
            return statusAcc;
        }, {});
        return acc;
    }, {});
};

const buildStatusSummaryFromEntries = (entries) => {
    const summary = createEmptyStatusSummary();

    for (const entry of entries) {
        const type = entry?.type;
        if (!FINANCE_TYPES.includes(type)) {
            continue;
        }
        const status = FINANCE_STATUSES.includes(entry.status) ? entry.status : 'pending';
        summary[type][status] += toNumber(entry.value);
    }

    return summary;
};

const formatMonth = (value) => {
    let date;

    if (value instanceof Date) {
        date = value;
    } else if (typeof value === 'string' || typeof value === 'number') {
        date = new Date(value);
    } else {
        return null;
    }

    if (!Number.isFinite(date?.getTime())) {
        return null;
    }

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');

    return `${year}-${month}`;
};

const buildMonthlySummaryFromEntries = (entries) => {
    const monthly = {};

    for (const entry of entries) {
        const type = entry?.type;
        if (!FINANCE_TYPES.includes(type)) {
            continue;
        }
        const month = formatMonth(entry.dueDate);
        if (!month) {
            continue;
        }

        if (!monthly[month]) {
            monthly[month] = FINANCE_TYPES.reduce((acc, currentType) => {
                acc[currentType] = 0;
                return acc;
            }, {});
        }

        monthly[month][type] += toNumber(entry.value);
    }

    return Object.keys(monthly)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .map(month => ({ month, ...monthly[month] }));
};

const startOfMonth = (date) => {
    const reference = parseDateCandidate(date) || new Date();
    return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
};

const endOfMonth = (date) => {
    const reference = parseDateCandidate(date) || new Date();
    return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 0, 23, 59, 59, 999));
};

const normalizeIntervalKey = (value) => {
    if (typeof value !== 'string') {
        return '';
    }
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
};

const INTERVAL_MAP = {
    monthly: { months: 1 },
    mensal: { months: 1 },
    mensalmente: { months: 1 },
    '1m': { months: 1 },
    biweekly: { days: 14 },
    quinzenal: { days: 14 },
    '2w': { days: 14 },
    weekly: { days: 7 },
    semanal: { days: 7 },
    '1w': { days: 7 },
    quarterly: { months: 3 },
    trimestral: { months: 3 },
    '3m': { months: 3 },
    yearly: { years: 1 },
    anual: { years: 1 },
    annually: { years: 1 },
    '12m': { years: 1 }
};

const DEFAULT_INTERVAL = INTERVAL_MAP.monthly;

const resolveInterval = (value) => {
    const key = normalizeIntervalKey(value);
    return INTERVAL_MAP[key] || DEFAULT_INTERVAL;
};

const addDaysUTC = (date, days) => {
    const reference = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    reference.setUTCDate(reference.getUTCDate() + days);
    return reference;
};

const addMonthsUTC = (date, months) => {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const base = new Date(Date.UTC(year, month + months, 1));
    const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
    base.setUTCDate(Math.min(day, lastDay));
    return base;
};

const addYearsUTC = (date, years) => addMonthsUTC(date, years * 12);

const advanceDateByInterval = (date, interval) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return null;
    }

    const { years = 0, months = 0, days = 0 } = interval || {};

    let result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

    if (years) {
        result = addYearsUTC(result, years);
    }

    if (months) {
        result = addMonthsUTC(result, months);
    }

    if (days) {
        result = addDaysUTC(result, days);
    }

    return result;
};

const buildProjectionBuckets = (referenceDate, months) => {
    const reference = startOfMonth(referenceDate);
    const totalMonths = Math.min(Math.max(months, 1), MAX_PROJECTION_MONTHS);
    const buckets = [];

    for (let index = 0; index < totalMonths; index += 1) {
        const current = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + index, 1));
        buckets.push({
            month: formatMonth(current),
            label: current.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
            start: current,
            end: endOfMonth(current)
        });
    }

    return buckets;
};

const buildActualMonthlyMap = (entries, monthKeys) => {
    const summary = buildMonthlySummaryFromEntries(entries);
    const keySet = new Set(monthKeys);
    return summary.reduce((acc, item) => {
        if (keySet.has(item.month)) {
            acc[item.month] = {
                payable: toNumber(item.payable),
                receivable: toNumber(item.receivable)
            };
        }
        return acc;
    }, {});
};

const buildRecurringProjectionMap = (entries, buckets) => {
    if (!Array.isArray(entries) || !entries.length || !Array.isArray(buckets) || !buckets.length) {
        return {};
    }

    const monthKeys = new Set(buckets.map(bucket => bucket.month));
    const rangeStart = buckets[0].start;
    const rangeEnd = buckets[buckets.length - 1].end;
    const projection = {};

    for (const entry of entries) {
        if (!entry?.recurring || !FINANCE_TYPES.includes(entry.type)) {
            continue;
        }

        const value = toNumber(entry.value);
        if (!value) {
            continue;
        }

        const dueDate = parseDateCandidate(entry.dueDate);
        if (!dueDate) {
            continue;
        }

        const interval = resolveInterval(entry.recurringInterval);
        let occurrence = advanceDateByInterval(dueDate, interval);
        let safety = 0;

        while (occurrence && occurrence <= rangeEnd && safety < 500) {
            safety += 1;
            if (occurrence >= rangeStart) {
                const monthKey = formatMonth(occurrence);
                if (monthKeys.has(monthKey)) {
                    if (!projection[monthKey]) {
                        projection[monthKey] = { payable: 0, receivable: 0 };
                    }
                    projection[monthKey][entry.type] += value;
                }
            }

            occurrence = advanceDateByInterval(occurrence, interval);
        }
    }

    return projection;
};

const fetchGoalsForMonths = async (monthKeys, options = {}) => {
    if (Array.isArray(options.goals)) {
        return options.goals;
    }

    if (!Array.isArray(monthKeys) || !monthKeys.length) {
        return [];
    }

    const monthValues = monthKeys.map((key) => {
        if (typeof key === 'string' && /^\d{4}-\d{2}$/.test(key)) {
            return `${key}-01`;
        }
        return key;
    });

    if (!FinanceGoal || typeof FinanceGoal.findAll !== 'function') {
        return [];
    }

    try {
        return await FinanceGoal.findAll({
            attributes: ['id', 'month', 'targetNetAmount', 'notes'],
            where: {
                month: { [Op.in]: monthValues }
            },
            order: [['month', 'ASC']],
            raw: true
        });
    } catch (error) {
        if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
            console.warn('Não foi possível buscar metas financeiras para projeções:', error);
        }
        return [];
    }
};

const buildGoalsMap = (goals) => {
    if (!Array.isArray(goals)) {
        return {};
    }

    return goals.reduce((acc, goal) => {
        const monthKey = formatMonth(goal.month);
        if (monthKey) {
            acc[monthKey] = {
                id: goal.id || null,
                targetNetAmount: toNullableNumber(goal.targetNetAmount),
                notes: goal.notes || null
            };
        }
        return acc;
    }, {});
};

const combineProjectionData = (buckets, actualMap, recurringMap, goalMap, referenceDate) => {
    if (!Array.isArray(buckets) || !buckets.length) {
        return [];
    }

    const referenceStart = startOfMonth(referenceDate);
    const currentMonthKey = formatMonth(referenceDate);

    return buckets.map((bucket) => {
        const actual = actualMap[bucket.month] || { payable: 0, receivable: 0 };
        const recurring = recurringMap[bucket.month] || { payable: 0, receivable: 0 };

        const actualPayable = toNumber(actual.payable);
        const actualReceivable = toNumber(actual.receivable);
        const recurringPayable = toNumber(recurring.payable);
        const recurringReceivable = toNumber(recurring.receivable);

        const projectedReceivable = actualReceivable + recurringReceivable;
        const projectedPayable = actualPayable + recurringPayable;

        const projectedNet = projectedReceivable - projectedPayable;
        const actualNet = actualReceivable - actualPayable;

        const goal = goalMap[bucket.month];
        const targetNet = goal ? toNullableNumber(goal.targetNetAmount) : null;
        const achieved = targetNet !== null ? projectedNet >= targetNet : null;
        const gapToGoal = targetNet !== null ? projectedNet - targetNet : null;

        return {
            month: bucket.month,
            label: bucket.label,
            start: bucket.start,
            end: bucket.end,
            actual: {
                receivable: roundNumber(actualReceivable),
                payable: roundNumber(actualPayable),
                net: roundNumber(actualNet)
            },
            projected: {
                receivable: roundNumber(projectedReceivable),
                payable: roundNumber(projectedPayable),
                net: roundNumber(projectedNet)
            },
            goal: goal ? {
                id: goal.id,
                targetNetAmount: targetNet !== null ? roundNumber(targetNet) : null,
                notes: goal.notes,
                achieved,
                gapToGoal: roundNullable(gapToGoal)
            } : null,
            hasGoal: Boolean(goal),
            needsAttention: Boolean(goal) && achieved === false,
            isCurrent: bucket.month === currentMonthKey,
            isFuture: bucket.start.getTime() > referenceStart.getTime(),
            isPast: bucket.start.getTime() < referenceStart.getTime()
        };
    });
};

const buildMonthlyProjectionFromEntries = async (entries, { referenceDate, months } = {}, options = {}) => {
    const reference = parseDateCandidate(referenceDate) || new Date();
    const projectionMonths = parseProjectionMonths(months);
    const buckets = buildProjectionBuckets(reference, projectionMonths);

    if (!buckets.length) {
        return [];
    }

    const monthKeys = buckets.map(bucket => bucket.month);
    const actualMap = buildActualMonthlyMap(entries, monthKeys);
    const recurringMap = buildRecurringProjectionMap(entries, buckets);
    const goals = await fetchGoalsForMonths(monthKeys, options);
    const goalMap = buildGoalsMap(goals);

    return combineProjectionData(buckets, actualMap, recurringMap, goalMap, reference);
};

const resolveProjectionSettings = (filters = {}, options = {}) => {
    const referenceCandidate = options.referenceDate ?? filters.referenceDate ?? filters.startDate;
    const referenceDate = parseDateCandidate(referenceCandidate) || new Date();
    const monthsCandidate = options.projectionMonths ?? filters.projectionMonths ?? filters.monthsAhead ?? filters.months;
    const months = parseProjectionMonths(monthsCandidate);
    return { referenceDate, months };
};

const buildTotalsFromStatus = (statusSummary) => {
    const totals = {
        payable: 0,
        receivable: 0,
        net: 0,
        overdue: 0,
        paid: 0,
        pending: 0
    };

    for (const type of FINANCE_TYPES) {
        const typeSummary = statusSummary?.[type] ?? {};
        totals[type] = FINANCE_STATUSES.reduce((sum, status) => {
            return sum + toNumber(typeSummary[status]);
        }, 0);
    }

    totals.net = totals.receivable - totals.payable;
    totals.overdue = toNumber(statusSummary?.payable?.overdue) + toNumber(statusSummary?.receivable?.overdue);
    totals.paid = toNumber(statusSummary?.payable?.paid) + toNumber(statusSummary?.receivable?.paid);
    totals.pending = toNumber(statusSummary?.payable?.pending) + toNumber(statusSummary?.receivable?.pending);

    return totals;
};

const fetchEntries = async (filters = {}) => {
    const where = {};

    const dateFilter = buildDateFilter(filters);
    if (dateFilter) {
        where.dueDate = dateFilter;
    }

    if (FINANCE_TYPES.includes(filters.type)) {
        where.type = filters.type;
    }

    if (FINANCE_STATUSES.includes(filters.status)) {
        where.status = filters.status;
    }

    if (Number.isInteger(filters.financeCategoryId)) {
        where.financeCategoryId = filters.financeCategoryId;
    } else if (Array.isArray(filters.financeCategoryIds) && filters.financeCategoryIds.length) {
        const ids = filters.financeCategoryIds
            .map((value) => Number.parseInt(value, 10))
            .filter((id) => Number.isInteger(id));
        if (ids.length) {
            where.financeCategoryId = { [Op.in]: Array.from(new Set(ids)) };
        }
    }

    return FinanceEntry.findAll({
        attributes: ['id', 'type', 'status', 'value', 'dueDate'],
        where,
        order: [
            ['dueDate', 'ASC'],
            ['id', 'ASC']
        ],
        raw: true
    });
};

const resolveEntries = async (filters = {}, options = {}) => {
    if (Array.isArray(options.entries)) {
        return options.entries;
    }
    return fetchEntries(filters);
};

const getStatusSummary = async (filters = {}, options = {}) => {
    const entries = await resolveEntries(filters, options);
    return buildStatusSummaryFromEntries(entries);
};

const getMonthlySummary = async (filters = {}, options = {}) => {
    const entries = await resolveEntries(filters, options);
    return buildMonthlySummaryFromEntries(entries);
};

const getMonthlyProjection = async (filters = {}, options = {}) => {
    const entries = await resolveEntries(filters, options);
    const settings = resolveProjectionSettings(filters, options);
    return buildMonthlyProjectionFromEntries(entries, settings, options);
};

const getFinanceSummary = async (filters = {}, options = {}) => {
    const entries = await resolveEntries(filters, options);
    const statusSummary = buildStatusSummaryFromEntries(entries);
    const projectionSettings = resolveProjectionSettings(filters, options);
    const projections = await buildMonthlyProjectionFromEntries(entries, projectionSettings, options);
    return {
        statusSummary,
        monthlySummary: buildMonthlySummaryFromEntries(entries),
        totals: buildTotalsFromStatus(statusSummary),
        projections
    };
};

module.exports = {
    getStatusSummary,
    getMonthlySummary,
    getMonthlyProjection,
    getFinanceSummary,
    constants: {
        FINANCE_TYPES: [...FINANCE_TYPES],
        FINANCE_STATUSES: [...FINANCE_STATUSES],
        FINANCE_RECURRING_INTERVALS: FINANCE_RECURRING_INTERVALS.map((interval) => ({ ...interval })),
        FINANCE_RECURRING_INTERVAL_VALUES: [...FINANCE_RECURRING_INTERVAL_VALUES],
        FINANCE_RECURRING_INTERVAL_LABEL_TO_VALUE: { ...FINANCE_RECURRING_INTERVAL_LABEL_TO_VALUE }
    },
    utils: {
        buildTotalsFromStatus,
        buildStatusSummaryFromEntries,
        buildMonthlySummaryFromEntries,
        buildMonthlyProjectionFromEntries,
        createEmptyStatusSummary,
        buildDateFilter,
        isValidISODate,
        resolveProjectionSettings,
        normalizeRecurringInterval

    }
};
