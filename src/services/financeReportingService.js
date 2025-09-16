'use strict';

const { FinanceEntry, Sequelize } = require('../../database/models');

const { Op } = Sequelize;

const FINANCE_TYPES = ['payable', 'receivable'];
const FINANCE_STATUSES = ['pending', 'paid', 'overdue', 'cancelled'];

const toNumber = (value) => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
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
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date?.getTime())) {
        return null;
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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

const getFinanceSummary = async (filters = {}, options = {}) => {
    const entries = await resolveEntries(filters, options);
    const statusSummary = buildStatusSummaryFromEntries(entries);
    return {
        statusSummary,
        monthlySummary: buildMonthlySummaryFromEntries(entries),
        totals: buildTotalsFromStatus(statusSummary)
    };
};

module.exports = {
    getStatusSummary,
    getMonthlySummary,
    getFinanceSummary,
    constants: {
        FINANCE_TYPES: [...FINANCE_TYPES],
        FINANCE_STATUSES: [...FINANCE_STATUSES]
    },
    utils: {
        buildTotalsFromStatus,
        buildStatusSummaryFromEntries,
        buildMonthlySummaryFromEntries,
        createEmptyStatusSummary,
        buildDateFilter,
        isValidISODate
    }
};
