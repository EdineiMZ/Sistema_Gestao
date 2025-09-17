// src/services/budgetAlertService.js
const {
    Budget,
    User,
    UserNotificationPreference
} = require('../../database/models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const { utils: { buildBudgetOverview } } = require('./financeReportingService');

const ALERT_STATUSES = ['caution', 'warning', 'critical'];
const STATUS_PRIORITY = {
    caution: 1,
    warning: 2,
    critical: 3
};

const normalizeArray = (value) => {
    if (value === undefined || value === null) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
};

const normalizeStatus = (value) => {
    if (!value) {
        return null;
    }
    const normalized = String(value).trim().toLowerCase();
    return ALERT_STATUSES.includes(normalized) ? normalized : null;
};

const resolveStatusFilter = (filters = {}) => {
    const statusList = normalizeArray(filters.statuses)
        .map(normalizeStatus)
        .filter(Boolean);

    if (statusList.length) {
        return new Set(statusList);
    }

    const minimumStatus = normalizeStatus(filters.minimumStatus);
    if (minimumStatus) {
        const minimumPriority = STATUS_PRIORITY[minimumStatus] || 0;
        return new Set(ALERT_STATUSES.filter((status) => STATUS_PRIORITY[status] >= minimumPriority));
    }

    return new Set(ALERT_STATUSES);
};

const normalizeMonthKey = (value) => {
    if (!value) {
        return null;
    }

    let reference;
    if (value instanceof Date) {
        reference = value;
    } else if (typeof value === 'string' || typeof value === 'number') {
        reference = new Date(value);
    }

    if (!(reference instanceof Date) || Number.isNaN(reference.getTime())) {
        return null;
    }

    const year = reference.getUTCFullYear();
    const month = String(reference.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
};

const parseTargetUserIds = (filters = {}) => {
    const rawValues = [
        ...normalizeArray(filters.targetUserIds),
        ...normalizeArray(filters.userIds)
    ];

    const parsed = rawValues
        .map((value) => {
            const numeric = Number.parseInt(value, 10);
            return Number.isInteger(numeric) ? numeric : null;
        })
        .filter((value) => value !== null);

    return new Set(parsed);
};

const buildUserInclude = () => ({
    model: UserNotificationPreference,
    as: 'notificationPreference',
    attributes: ['emailEnabled', 'scheduledEnabled'],
    required: false
});

const buildUserWhere = (userIds, { onlyActive = true } = {}) => {
    const where = {};
    if (Array.isArray(userIds) && userIds.length) {
        where.id = { [Op.in]: userIds };
    }
    if (onlyActive) {
        where.active = true;
    }
    return where;
};

const collectBudgetAlerts = async ({ now = new Date(), filters = {} } = {}) => {
    if (!Budget || typeof Budget.findAll !== 'function') {
        logger.debug('Serviço de alertas de orçamento: modelo Budget indisponível.');
        return [];
    }

    if (!User || typeof User.findAll !== 'function') {
        logger.debug('Serviço de alertas de orçamento: modelo User indisponível.');
        return [];
    }

    let budgetRows;
    try {
        budgetRows = await Budget.findAll({
            attributes: ['userId'],
            raw: true
        });
    } catch (error) {
        logger.error('Falha ao carregar usuários com orçamento configurado:', error);
        return [];
    }

    const uniqueUserIds = Array.from(new Set(
        budgetRows
            .map((row) => Number.parseInt(row.userId, 10))
            .filter((value) => Number.isInteger(value))
    ));

    const targetUserIds = parseTargetUserIds(filters);
    const filteredUserIds = targetUserIds.size
        ? uniqueUserIds.filter((id) => targetUserIds.has(id))
        : uniqueUserIds;

    if (!filteredUserIds.length) {
        logger.debug('Serviço de alertas de orçamento: nenhum usuário elegível encontrado.');
        return [];
    }

    const userWhere = buildUserWhere(filteredUserIds, { onlyActive: filters.onlyActive !== false });
    let users;
    try {
        users = await User.findAll({
            where: userWhere,
            attributes: ['id', 'name', 'email', 'role', 'active'],
            include: [buildUserInclude()]
        });
    } catch (error) {
        logger.error('Falha ao carregar usuários para alertas de orçamento:', error);
        return [];
    }

    if (!Array.isArray(users) || !users.length) {
        logger.debug('Serviço de alertas de orçamento: nenhum usuário carregado para avaliação.');
        return [];
    }

    const currentMonthKey = normalizeMonthKey(now);
    const statusesToConsider = resolveStatusFilter(filters);
    const includePastMonths = filters.includePastMonths === true;

    const alerts = [];

    for (const user of users) {
        if (!user) {
            continue;
        }

        let overview;
        try {
            overview = await buildBudgetOverview({ userId: user.id });
        } catch (error) {
            logger.error(`Erro ao construir overview de orçamento para usuário ${user.id}:`, error);
            continue;
        }

        const summaries = Array.isArray(overview?.summaries) ? overview.summaries : [];
        for (const summary of summaries) {
            if (!summary || !summary.status || !statusesToConsider.has(summary.status)) {
                continue;
            }

            if (!includePastMonths && currentMonthKey && summary.month && summary.month !== currentMonthKey) {
                continue;
            }

            const limitValue = Number.parseFloat(summary.monthlyLimit);
            if (!Number.isFinite(limitValue) || limitValue <= 0) {
                continue;
            }

            alerts.push({
                user,
                summary,
                context: {
                    contextType: 'budget-alert',
                    userId: user.id ?? null,
                    budgetId: summary.budgetId ?? null,
                    categoryId: summary.categoryId ?? null,
                    month: summary.month ?? null,
                    status: summary.status ?? null
                },
                extras: {
                    budgetCategoryName: summary.categoryName,
                    budgetMonthLabel: summary.monthLabel,
                    budgetLimit: summary.monthlyLimit,
                    budgetConsumption: summary.consumption,
                    budgetRemaining: summary.remaining,
                    budgetPercentage: summary.percentage,
                    budgetStatus: summary.status,
                    budgetStatusLabel: summary.statusLabel,
                    budgetStatusMeta: summary.statusMeta
                }
            });
        }
    }

    logger.debug(`Serviço de alertas de orçamento: ${alerts.length} alerta(s) elegíveis para envio.`);
    return alerts;
};

module.exports = {
    collectBudgetAlerts,
    constants: {
        ALERT_STATUSES,
        STATUS_PRIORITY
    }
};
