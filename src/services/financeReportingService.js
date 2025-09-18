'use strict';

const { Op: SequelizeModuleOp } = require('sequelize');
const { FinanceEntry, FinanceGoal, Budget, FinanceCategory, Sequelize } = require('../../database/models');
const { getBudgetThresholdDefaults, isBudgetAlertEnabled } = require('../../config/default');
const {
    FINANCE_RECURRING_INTERVALS,
    FINANCE_RECURRING_INTERVAL_VALUES,
    FINANCE_RECURRING_INTERVAL_LABEL_TO_VALUE,
    normalizeRecurringInterval
} = require('../constants/financeRecurringIntervals');

const Op = (Sequelize && Sequelize.Op) || SequelizeModuleOp;

const FINANCE_TYPES = ['payable', 'receivable'];
const FINANCE_STATUSES = ['pending', 'paid', 'overdue', 'cancelled'];
const BUDGET_STATUS_PRIORITY = {
    healthy: 1,
    caution: 2,
    warning: 3,
    critical: 4
};
const DEFAULT_STATUS_META = {
    healthy: { key: 'healthy', label: 'Consumo saudável', textColor: '#065f46', barColor: '#10b981', badgeClass: 'bg-success-subtle text-success' },
    caution: { key: 'caution', label: 'Consumo moderado', textColor: '#1d4ed8', barColor: '#2563eb', badgeClass: 'bg-primary-subtle text-primary' },
    warning: { key: 'warning', label: 'Atenção ao consumo', textColor: '#b45309', barColor: '#f59e0b', badgeClass: 'bg-warning-subtle text-warning' },
    critical: { key: 'critical', label: 'Limite excedido', textColor: '#b91c1c', barColor: '#ef4444', badgeClass: 'bg-danger-subtle text-danger' }
};
const DEFAULT_PROJECTION_MONTHS = 6;
const MAX_PROJECTION_MONTHS = 24;

const BUDGET_ALERT_ENABLED = isBudgetAlertEnabled();
const BUDGET_THRESHOLD_DEFAULTS = (() => {
    const defaults = getBudgetThresholdDefaults();
    const normalized = Array.isArray(defaults)
        ? defaults
            .map((value) => {
                const numeric = Number.parseFloat(value);
                if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1) {
                    return null;
                }
                return Number(numeric.toFixed(4));
            })
            .filter((value) => value !== null)
        : [];

    if (normalized.length) {
        normalized.sort((a, b) => a - b);
        return Object.freeze(normalized);
    }

    if (!BUDGET_ALERT_ENABLED) {
        return Object.freeze([]);
    }

    return Object.freeze([0.5, 0.75, 0.9]);
})();

const getDefaultThresholdList = () => (BUDGET_THRESHOLD_DEFAULTS.length ? [...BUDGET_THRESHOLD_DEFAULTS] : []);

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

const parseIntegerId = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const numeric = Number(value);
    return Number.isInteger(numeric) ? numeric : null;
};

const isMissingTableError = (error, tableName) => {
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

const getSequelizeInstance = () => {
    if (FinanceEntry?.sequelize) {
        return FinanceEntry.sequelize;
    }
    if (Budget?.sequelize) {
        return Budget.sequelize;
    }
    if (FinanceGoal?.sequelize) {
        return FinanceGoal.sequelize;
    }
    return null;
};

const getDialect = () => {
    const sequelizeInstance = getSequelizeInstance();
    if (sequelizeInstance && typeof sequelizeInstance.getDialect === 'function') {
        return sequelizeInstance.getDialect();
    }
    return 'sqlite';
};

const buildMonthKeyExpression = (column = 'dueDate') => {
    const dialect = getDialect();
    const columnRef = Sequelize.col(column);
    if (dialect === 'postgres') {
        return Sequelize.fn('to_char', columnRef, 'YYYY-MM');
    }
    if (dialect === 'mysql' || dialect === 'mariadb') {
        return Sequelize.fn('DATE_FORMAT', columnRef, '%Y-%m');
    }
    return Sequelize.fn('strftime', '%Y-%m', columnRef);
};

const buildMonthStartExpression = (column = 'dueDate') => {
    const dialect = getDialect();
    const columnRef = Sequelize.col(column);
    if (dialect === 'postgres') {
        return Sequelize.fn('date_trunc', 'month', columnRef);
    }
    if (dialect === 'mysql' || dialect === 'mariadb') {
        return Sequelize.fn('DATE_FORMAT', columnRef, '%Y-%m-01');
    }
    return Sequelize.fn('strftime', '%Y-%m-01', columnRef);
};

const formatMonthLabelLocalized = (monthKey) => {
    if (!monthKey || typeof monthKey !== 'string') {
        return '';
    }

    const normalized = `${monthKey}-01T00:00:00Z`;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
        return monthKey;
    }
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

const normalizeNumber = (value, precision = 2) => {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
        return 0;
    }
    return Number(parsed.toFixed(precision));
};

const normalizeThresholdList = (value) => {
    if (value === null || value === undefined) {
        return getDefaultThresholdList();
    }

    const rawList = Array.isArray(value) ? value : [value];
    const normalized = rawList
        .map((item) => {
            if (item === null || item === undefined || item === '') {
                return null;
            }

            const raw = typeof item === 'string' ? item.trim() : String(item).trim();
            if (!raw) {
                return null;
            }

            const sanitized = raw.replace(',', '.');
            const parsed = Number.parseFloat(sanitized);
            if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
                return null;
            }
            return Number(parsed.toFixed(4));
        })
        .filter((item) => item !== null);

    if (!normalized.length) {
        return getDefaultThresholdList();
    }

    const unique = Array.from(new Set(normalized));
    unique.sort((a, b) => a - b);
    return unique;
};

const resolveBudgetStatus = (consumption, limit, thresholds = []) => {
    const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 0;
    const safeConsumption = Number.isFinite(Number(consumption)) ? Number(consumption) : 0;
    const ratio = safeLimit > 0 ? safeConsumption / safeLimit : null;
    const sortedThresholds = normalizeThresholdList(thresholds);

    if (ratio !== null && ratio >= 1) {
        return { ...DEFAULT_STATUS_META.critical };
    }

    if (sortedThresholds.length) {
        const warningThreshold = sortedThresholds[sortedThresholds.length - 1];
        const cautionThreshold = sortedThresholds.find((value) => value < warningThreshold) ?? sortedThresholds[0];

        if (Number.isFinite(warningThreshold) && ratio !== null && ratio >= warningThreshold) {
            return { ...DEFAULT_STATUS_META.warning };
        }

        if (Number.isFinite(cautionThreshold) && ratio !== null && ratio >= cautionThreshold) {
            return { ...DEFAULT_STATUS_META.caution };
        }
    }

    if (ratio !== null && ratio >= 0.85) {
        return { ...DEFAULT_STATUS_META.warning };
    }

    if (ratio !== null && ratio >= 0.6) {
        return { ...DEFAULT_STATUS_META.caution };
    }

    return { ...DEFAULT_STATUS_META.healthy };
};

const mergeStatusMeta = (statusA, statusB) => {
    const metaA = DEFAULT_STATUS_META[statusA?.key || statusA] || DEFAULT_STATUS_META.healthy;
    const metaB = DEFAULT_STATUS_META[statusB?.key || statusB] || DEFAULT_STATUS_META.healthy;
    const priorityA = BUDGET_STATUS_PRIORITY[metaA.key] || 0;
    const priorityB = BUDGET_STATUS_PRIORITY[metaB.key] || 0;
    return priorityA >= priorityB ? metaA : metaB;
};

const buildBudgetSummaryPayload = (budget, consumptionValue, monthKey) => {
    const monthlyLimit = normalizeNumber(budget?.monthlyLimit || 0);
    const consumption = normalizeNumber(consumptionValue || 0);
    const remaining = normalizeNumber(monthlyLimit - consumption);
    const percentage = monthlyLimit > 0 ? normalizeNumber((consumption / monthlyLimit) * 100) : 0;
    const thresholds = normalizeThresholdList(budget?.thresholds);
    const statusMeta = resolveBudgetStatus(consumption, monthlyLimit, thresholds);

    return {
        budgetId: budget?.id || null,
        categoryId: budget?.financeCategoryId || null,
        categorySlug: budget?.category?.slug || null,
        categoryName: budget?.category?.name || 'Sem categoria',
        categoryColor: budget?.category?.color || '#6b7280',
        month: monthKey,
        monthLabel: formatMonthLabelLocalized(monthKey),
        monthlyLimit,
        consumption,
        remaining,
        percentage,
        thresholds,
        status: statusMeta.key,
        statusLabel: statusMeta.label,
        statusMeta
    };
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

const fetchBudgetRows = async (filters = {}) => {
    if (!Budget || typeof Budget.findAll !== 'function') {
        return [];
    }

    const where = {};
    const userId = parseIntegerId(filters.userId);
    if (userId !== null) {
        where.userId = userId;
    }

    if (Number.isInteger(filters.userId)) {
        where.userId = filters.userId;
    } else if (Number.isInteger(Number(filters.userId))) {
        where.userId = Number(filters.userId);
    }

    if (Number.isInteger(filters.financeCategoryId)) {
        where.financeCategoryId = filters.financeCategoryId;
    } else if (Number.isInteger(Number(filters.financeCategoryId))) {
        where.financeCategoryId = Number(filters.financeCategoryId);
    }

    try {
        return await Budget.findAll({
            where,
            attributes: ['id', 'monthlyLimit', 'thresholds', 'referenceMonth', 'userId', 'financeCategoryId'],
            include: [
                {
                    model: FinanceCategory,
                    as: 'category',
                    attributes: ['id', 'name', 'slug', 'color'],
                    required: false
                }
            ],
            order: [
                ['financeCategoryId', 'ASC']
            ],
            raw: true,
            nest: true
        });
    } catch (error) {
        if (isMissingTableError(error, 'Budgets')) {
            return [];
        }
        throw error;
    }
};

const fetchCategoryMonthlyConsumption = async (filters = {}) => {
    if (Array.isArray(filters.entries)) {
        return buildConsumptionRowsFromEntries(filters.entries, filters);
    }

    const where = {};
    const userId = parseIntegerId(filters.userId);
    if (userId !== null) {
        where.userId = userId;
    }
    const dateFilter = buildDateFilter(filters);
    if (dateFilter) {
        where.dueDate = dateFilter;
    }

    if (FINANCE_STATUSES.includes(filters.status)) {
        where.status = filters.status;
    }

    if (FINANCE_TYPES.includes(filters.type)) {
        where.type = filters.type;
    } else {
        where.type = 'payable';
    }

    const monthKeyExpr = buildMonthKeyExpression('FinanceEntry.dueDate');
    const monthStartExpr = buildMonthStartExpression('FinanceEntry.dueDate');

    return FinanceEntry.findAll({
        attributes: [
            [monthKeyExpr, 'month'],
            [monthStartExpr, 'monthStart'],
            ['financeCategoryId', 'financeCategoryId'],
            [Sequelize.fn('SUM', Sequelize.col('FinanceEntry.value')), 'totalValue']
        ],
        where,
        group: [Sequelize.literal('month'), 'financeCategoryId'],
        raw: true
    });
};

const resolveEntriesForBudget = async (filters = {}, options = {}) => {
    if (Array.isArray(options.entries)) {
        return options.entries;
    }

    if (options.entriesPromise && typeof options.entriesPromise.then === 'function') {
        try {
            const result = await options.entriesPromise;
            if (Array.isArray(result)) {
                return result;
            }
        } catch (error) {
            console.warn('Não foi possível resolver entriesPromise para orçamentos:', error?.message || error);
        }
    }

    if (Array.isArray(filters.entries)) {
        return filters.entries;
    }

    return null;
};

const buildConsumptionRowsFromEntries = (entries = [], filters = {}) => {
    if (!Array.isArray(entries) || !entries.length) {
        return [];
    }

    const typeFilter = FINANCE_TYPES.includes(filters.type) ? filters.type : 'payable';
    const statusFilter = FINANCE_STATUSES.includes(filters.status) ? filters.status : null;
    const dateFilter = buildDateFilter(filters);

    const rangeStart = dateFilter?.[Op.gte] ? new Date(dateFilter[Op.gte]) : null;
    const rangeEnd = dateFilter?.[Op.lte] ? new Date(dateFilter[Op.lte]) : null;

    const map = new Map();

    entries.forEach((entry) => {
        const plain = typeof entry?.get === 'function' ? entry.get({ plain: true }) : entry;
        if (!plain) {
            return;
        }

        if (plain.type && plain.type !== typeFilter) {
            return;
        }

        if (statusFilter && plain.status !== statusFilter) {
            return;
        }

        const dueDate = parseDateCandidate(plain.dueDate);
        if (!dueDate) {
            return;
        }

        if (rangeStart && dueDate < rangeStart) {
            return;
        }

        if (rangeEnd && dueDate > rangeEnd) {
            return;
        }

        const monthKey = formatMonth(dueDate);
        if (!monthKey) {
            return;
        }

        const categoryId = Number(plain.financeCategoryId) || null;
        if (!categoryId) {
            return;
        }

        const key = `${categoryId}::${monthKey}`;
        const current = map.get(key) || 0;
        map.set(key, normalizeNumber(current + Number(plain.value || 0)));
    });

    return Array.from(map.entries()).map(([key, totalValue]) => {
        const [categoryId, month] = key.split('::');
        return {
            financeCategoryId: Number(categoryId),
            month,
            monthStart: `${month}-01`,
            totalValue
        };
    });
};

const fetchCategoriesForIds = async (categoryIds = []) => {
    if (!Array.isArray(categoryIds) || !categoryIds.length) {
        return {};
    }

    const uniqueIds = Array.from(new Set(categoryIds.filter((id) => Number.isInteger(id) || Number.isInteger(Number(id)))));
    if (!uniqueIds.length) {
        return {};
    }

    const normalizedIds = uniqueIds.map((id) => Number(id));
    if (!FinanceCategory || (typeof FinanceCategory.findAll !== 'function' && typeof FinanceCategory.scope !== 'function')) {
        return {};
    }

    let categoryQuery = FinanceCategory;
    if (FinanceCategory?.scope) {
        categoryQuery = FinanceCategory.scope('all');
    }

    const categories = await categoryQuery.findAll({
        attributes: ['id', 'name', 'slug', 'color'],
        where: {
            id: {
                [Op.in]: normalizedIds
            }
        },
        raw: true
    });

    return categories.reduce((acc, category) => {
        acc[category.id] = category;
        return acc;
    }, {});
};

const buildBudgetOverview = async (filters = {}, options = {}) => {
    const resolvedEntries = await resolveEntriesForBudget(filters, options);
    const [budgetRows, consumptionRows] = await Promise.all([
        fetchBudgetRows(filters),
        fetchCategoryMonthlyConsumption(resolvedEntries ? { ...filters, entries: resolvedEntries } : filters)
    ]);

    const categoryIds = [
        ...budgetRows.map((budget) => budget.financeCategoryId),
        ...consumptionRows.map((row) => row.financeCategoryId)
    ].filter((value) => value !== null && value !== undefined);

    const categoryMap = await fetchCategoriesForIds(categoryIds);

    const monthKeys = new Set();
    const consumptionMap = new Map();

    consumptionRows.forEach((row) => {
        const categoryId = Number(row.financeCategoryId) || null;
        if (!categoryId) {
            return;
        }

        let monthKey = typeof row.month === 'string' ? row.month : null;
        if (!monthKey && row.monthStart) {
            monthKey = formatMonth(row.monthStart);
        }

        if (!monthKey) {
            return;
        }

        monthKeys.add(monthKey);
        const mapKey = `${categoryId}::${monthKey}`;
        const current = consumptionMap.get(mapKey) || 0;
        consumptionMap.set(mapKey, normalizeNumber(current + Number(row.totalValue || 0)));
    });

    if (!monthKeys.size) {
        budgetRows.forEach((budget) => {
            const refMonth = formatMonth(budget.referenceMonth);
            if (refMonth) {
                monthKeys.add(refMonth);
            }
        });
    }

    if (!monthKeys.size) {
        const currentMonth = formatMonth(new Date());
        if (currentMonth) {
            monthKeys.add(currentMonth);
        }
    }

    const sortedMonths = Array.from(monthKeys).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const categoriesWithBudget = new Set();
    const summaryItems = [];

    budgetRows.forEach((budget) => {
        const categoryId = Number(budget.financeCategoryId) || null;
        if (categoryId) {
            categoriesWithBudget.add(categoryId);
        }

        if (!budget.category || !budget.category.id) {
            const fallbackCategory = categoryMap[categoryId];
            if (fallbackCategory) {
                budget.category = fallbackCategory;
            }
        }

        const referenceMonth = formatMonth(budget.referenceMonth);
        const monthsToConsider = referenceMonth ? [referenceMonth] : sortedMonths;

        monthsToConsider.forEach((monthKey) => {
            const consumptionValue = consumptionMap.get(`${categoryId}::${monthKey}`) || 0;
            const payload = buildBudgetSummaryPayload(budget, consumptionValue, monthKey);
            summaryItems.push(payload);
        });
    });

    consumptionRows.forEach((row) => {
        const categoryId = Number(row.financeCategoryId) || null;
        if (!categoryId || categoriesWithBudget.has(categoryId)) {
            return;
        }

        const monthKey = typeof row.month === 'string' ? row.month : formatMonth(row.monthStart);
        const consumptionValue = normalizeNumber(row.totalValue || 0);
        const category = categoryMap[categoryId] || {
            id: categoryId,
            name: 'Categoria não classificada',
            slug: null,
            color: '#6b7280'
        };

        const syntheticBudget = {
            id: null,
            monthlyLimit: 0,
            thresholds: [],
            referenceMonth: monthKey ? `${monthKey}-01` : null,
            financeCategoryId: categoryId,
            category
        };

        const payload = buildBudgetSummaryPayload(syntheticBudget, consumptionValue, monthKey);
        summaryItems.push(payload);
    });

    const categoryAggregation = new Map();

    summaryItems.forEach((item) => {
        if (!item.categoryId) {
            return;
        }
        if (!categoryAggregation.has(item.categoryId)) {
            categoryAggregation.set(item.categoryId, {
                categoryId: item.categoryId,
                categoryName: item.categoryName,
                categoryColor: item.categoryColor,
                categorySlug: item.categorySlug,
                totalLimit: 0,
                totalConsumption: 0,
                months: 0,
                statusMeta: item.statusMeta,
                maxPercentage: 0
            });
        }

        const aggregate = categoryAggregation.get(item.categoryId);
        aggregate.totalLimit = normalizeNumber(aggregate.totalLimit + item.monthlyLimit);
        aggregate.totalConsumption = normalizeNumber(aggregate.totalConsumption + item.consumption);
        aggregate.months += 1;
        aggregate.statusMeta = mergeStatusMeta(aggregate.statusMeta, item.statusMeta);
        aggregate.maxPercentage = Math.max(aggregate.maxPercentage, item.percentage || 0);
    });

    const categoryConsumption = Array.from(categoryAggregation.values())
        .map((aggregate) => {
            const averagePercentage = aggregate.totalLimit > 0
                ? normalizeNumber((aggregate.totalConsumption / aggregate.totalLimit) * 100)
                : 0;
            const remaining = normalizeNumber(aggregate.totalLimit - aggregate.totalConsumption);

            return {
                categoryId: aggregate.categoryId,
                categoryName: aggregate.categoryName,
                categoryColor: aggregate.categoryColor,
                categorySlug: aggregate.categorySlug,
                months: aggregate.months,
                totalLimit: aggregate.totalLimit,
                totalConsumption: aggregate.totalConsumption,
                remaining,
                averagePercentage,
                highestPercentage: normalizeNumber(aggregate.maxPercentage),
                status: aggregate.statusMeta.key,
                statusLabel: aggregate.statusMeta.label,
                statusMeta: aggregate.statusMeta
            };
        })
        .sort((a, b) => {
            if (b.totalConsumption !== a.totalConsumption) {
                return b.totalConsumption - a.totalConsumption;
            }
            return a.categoryName.localeCompare(b.categoryName, 'pt-BR');
        });

    return {
        summaries: summaryItems.sort((a, b) => {
            if (a.month === b.month) {
                return a.categoryName.localeCompare(b.categoryName, 'pt-BR');
            }
            return a.month < b.month ? -1 : 1;
        }),
        categoryConsumption,
        months: sortedMonths
    };
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
        if (isMissingTableError(error, 'FinanceGoals')) {
            return [];
        }
        throw error;
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

    const userId = parseIntegerId(filters.userId);
    if (userId !== null) {
        where.userId = userId;
    }

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

const getBudgetSummaries = async (filters = {}, options = {}) => {
    const overview = await buildBudgetOverview(filters, options);
    if (options && options.includeCategoryConsumption) {
        return overview;
    }
    return overview.summaries;
};

const getCategoryConsumption = async (filters = {}, options = {}) => {
    if (options?.budgetOverview && Array.isArray(options.budgetOverview.categoryConsumption)) {
        return options.budgetOverview.categoryConsumption;
    }
    if (Array.isArray(options?.budgetSummaries)) {
        const overview = await buildBudgetOverview(filters, { ...options, summaries: options.budgetSummaries });
        return overview.categoryConsumption;
    }
    const overview = await buildBudgetOverview(filters, options);
    return overview.categoryConsumption;
};

module.exports = {
    getStatusSummary,
    getMonthlySummary,
    getMonthlyProjection,
    getFinanceSummary,
    getBudgetSummaries,
    getCategoryConsumption,
    constants: {
        FINANCE_TYPES: [...FINANCE_TYPES],
        FINANCE_STATUSES: [...FINANCE_STATUSES],
        FINANCE_RECURRING_INTERVALS: FINANCE_RECURRING_INTERVALS.map((interval) => ({ ...interval })),
        FINANCE_RECURRING_INTERVAL_VALUES: [...FINANCE_RECURRING_INTERVAL_VALUES],
        FINANCE_RECURRING_INTERVAL_LABEL_TO_VALUE: { ...FINANCE_RECURRING_INTERVAL_LABEL_TO_VALUE },
        BUDGET_ALERT_ENABLED,
        BUDGET_THRESHOLD_DEFAULTS: getDefaultThresholdList()
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
        normalizeRecurringInterval,
        buildBudgetOverview,
        normalizeThresholdList,
        resolveBudgetStatus,
        DEFAULT_STATUS_META,
        getConfiguredBudgetThresholds: () => getDefaultThresholdList(),
        budgetAlertEnabled: BUDGET_ALERT_ENABLED

    }
};
