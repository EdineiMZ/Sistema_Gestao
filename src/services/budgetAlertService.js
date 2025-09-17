'use strict';

const crypto = require('node:crypto');
const {
    Budget,
    BudgetThresholdLog,
    Notification,
    NotificationDispatchLog,
    FinanceCategory,
    User,
    UserNotificationPreference,
    sequelize,
    Sequelize
} = require('../../database/models');
const financeReportingService = require('./financeReportingService');
const { sendEmail } = require('../utils/email');
const { buildEmailContent } = require('../utils/placeholderUtils');
const {
    getDefaultBudgetThresholds,
    buildBudgetLink,
    DEFAULT_BUDGET_ALERT_ACCENT
} = require('../config/budgets');

const { Op } = Sequelize;

const ORGANIZATION_NAME = process.env.APP_NAME || 'Sistema de Gestão';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
});

const formatCurrency = (value) => {
    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric)) {
        return currencyFormatter.format(0);
    }
    return currencyFormatter.format(numeric);
};

const toNumber = (value) => {
    const numeric = Number.parseFloat(value);
    return Number.isFinite(numeric) ? numeric : 0;
};

const resolveMonthKey = (reference, now = new Date()) => {
    const baseDate = reference ? new Date(reference) : now;
    if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())) {
        return resolveMonthKey(null, now);
    }

    const year = baseDate.getUTCFullYear();
    const month = String(baseDate.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
};

const monthKeyToRange = (monthKey) => {
    const [yearStr, monthStr] = String(monthKey).split('-');
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10);

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        const today = new Date();
        return monthKeyToRange(`${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`);
    }

    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const toIsoDate = (date) => date.toISOString().slice(0, 10);

    return {
        startDate: toIsoDate(start),
        endDate: toIsoDate(end),
        referenceMonth: toIsoDate(start)
    };
};

const shouldNotifyUser = (user) => {
    if (!user || !user.email) {
        return false;
    }

    const preference = user.notificationPreference || {};
    const emailEnabled = preference.emailEnabled !== false;
    const scheduledEnabled = preference.scheduledEnabled !== false;

    return emailEnabled && scheduledEnabled;
};

const buildNotificationPayload = ({
    user,
    categoryName,
    threshold,
    limitValue,
    consumptionValue,
    monthKey
}) => {
    const percent = Math.round(threshold * 100);
    const subject = `Orçamento de ${categoryName} atingiu ${percent}%`; 

    const summaryLine = `${formatCurrency(consumptionValue)} de ${formatCurrency(limitValue)} (${percent}%)`;
    const monthLabel = `${monthKey.split('-')[1]}/${monthKey.split('-')[0]}`;
    const budgetLink = buildBudgetLink();
    const greeting = user?.name ? `Olá, ${user.name.split(' ')[0]}!` : 'Olá!';

    const textBody = [
        greeting,
        `O orçamento da categoria ${categoryName} atingiu ${percent}% do limite mensal (${monthLabel}).`,
        `Consumo registrado: ${summaryLine}.`,
        'Acesse o painel de orçamentos para revisar os lançamentos e planejar os próximos passos:',
        budgetLink
    ].join('\n\n');

    const htmlBody = [
        `<p>${greeting}</p>`,
        `<p>O orçamento da categoria <strong>${categoryName}</strong> atingiu <strong>${percent}%</strong> do limite mensal (${monthLabel}).</p>`,
        `<p>Consumo registrado: <strong>${summaryLine}</strong>.</p>`,
        '<p>Acesse o painel de orçamentos para revisar os lançamentos e planejar os próximos passos.</p>',
        `<p><a class="cta-button" href="${budgetLink}" target="_blank" rel="noopener noreferrer">Abrir orçamentos</a></p>`
    ].join('');

    const previewText = `Consumo de ${summaryLine} em ${categoryName}`;

    return {
        notificationData: {
            title: subject,
            message: textBody,
            messageHtml: htmlBody,
            accentColor: DEFAULT_BUDGET_ALERT_ACCENT,
            previewText,
            type: 'budget-threshold',
            active: false,
            sent: true,
            status: 'sent'
        },
        emailContext: {
            extras: {
                organizationName: ORGANIZATION_NAME,
                customMessage: summaryLine
            }
        }
    };
};

const createDispatchLog = async ({ notificationId, recipient, context }) => {
    const hash = crypto.createHash('sha256').update(JSON.stringify(context)).digest('hex');

    try {
        await NotificationDispatchLog.create({
            notificationId,
            recipient,
            cycleKey: context.cycleKey,
            contextHash: hash,
            context,
            sentAt: new Date()
        });
    } catch (error) {
        if (error?.name !== 'SequelizeUniqueConstraintError') {
            throw error;
        }
    }
};

const evaluateThreshold = async ({
    budget,
    threshold,
    monthKey,
    limitValue,
    consumptionValue,
    referenceMonthDate,
    user
}) => {
    const transaction = await sequelize.transaction();
    let persistedLog = null;

    try {
        const [logEntry, created] = await BudgetThresholdLog.findOrCreate({
            where: {
                budgetId: budget.id,
                referenceMonth: referenceMonthDate,
                threshold
            },
            defaults: {
                consumptionValue,
                limitValue,
                triggeredAt: new Date()
            },
            transaction
        });

        if (!created) {
            await transaction.rollback();
            return null;
        }

        persistedLog = logEntry;
        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        console.error('Erro ao registrar limiar de orçamento:', error);
        return null;
    }

    let notificationRecord = null;

    try {
        const { notificationData, emailContext } = buildNotificationPayload({
            user,
            categoryName: budget.category?.name || 'Categoria',
            threshold,
            limitValue,
            consumptionValue,
            monthKey
        });

        notificationRecord = await Notification.create({
            ...notificationData,
            userId: user?.id || null,
            triggerDate: new Date(),
            filters: {
                budgetId: budget.id,
                categoryId: budget.financeCategoryId,
                month: monthKey,
                threshold
            }
        });

        const emailContent = buildEmailContent(notificationRecord, {
            user,
            extras: emailContext.extras
        });

        await sendEmail(user.email, emailContent.subject, {
            text: emailContent.text,
            html: emailContent.html
        });

        const context = {
            contextType: 'budget-threshold',
            cycleKey: `budget:${budget.id}:${monthKey}:${threshold}`,
            budgetId: budget.id,
            categoryId: budget.financeCategoryId,
            threshold,
            monthKey,
            limitValue,
            consumptionValue
        };

        await createDispatchLog({
            notificationId: notificationRecord.id,
            recipient: user.email,
            context
        });

        return {
            budgetId: budget.id,
            threshold,
            monthKey,
            notificationId: notificationRecord.id,
            recipient: user.email
        };
    } catch (error) {
        if (persistedLog) {
            try {
                await persistedLog.destroy();
            } catch (cleanupError) {
                console.error('Erro ao reverter log de limiar após falha de envio:', cleanupError);
            }
        }
        if (notificationRecord) {
            try {
                await notificationRecord.destroy();
            } catch (cleanupError) {
                console.error('Erro ao remover notificação parcial de orçamento:', cleanupError);
            }
        }
        console.error('Erro ao enviar alerta de orçamento:', error);
        return null;
    }
};

const evaluateBudget = async (budget, now) => {
    const user = budget.user;

    if (!shouldNotifyUser(user)) {
        return [];
    }

    const monthKey = resolveMonthKey(budget.referenceMonth, now);
    const { startDate, endDate, referenceMonth } = monthKeyToRange(monthKey);

    const thresholds = Array.isArray(budget.thresholds) && budget.thresholds.length
        ? budget.thresholds
        : getDefaultBudgetThresholds();

    if (!thresholds.length) {
        return [];
    }

    const limitValue = Math.round(toNumber(budget.monthlyLimit) * 100) / 100;
    if (limitValue <= 0) {
        return [];
    }

    const summary = await financeReportingService.getMonthlySummary({
        startDate,
        endDate,
        type: 'payable',
        financeCategoryId: budget.financeCategoryId
    });

    const consumptionValue = (() => {
        const monthData = Array.isArray(summary)
            ? summary.find((entry) => entry.month === monthKey)
            : null;
        return monthData ? toNumber(monthData.payable) : 0;
    })();

    if (consumptionValue <= 0) {
        return [];
    }

    const normalizedConsumption = Math.round(consumptionValue * 100) / 100;

    const triggered = [];

    for (const threshold of thresholds) {
        if (!Number.isFinite(threshold) || threshold <= 0) {
            continue;
        }

        const targetValue = limitValue * threshold;
        if (normalizedConsumption < targetValue) {
            continue;
        }

        const result = await evaluateThreshold({
            budget,
            threshold,
            monthKey,
            limitValue,
            consumptionValue: normalizedConsumption,
            referenceMonthDate: referenceMonth,
            user
        });

        if (result) {
            triggered.push(result);
        }
    }

    return triggered;
};

const processBudgetAlerts = async ({ now = new Date() } = {}) => {
    const budgets = await Budget.findAll({
        where: {
            monthlyLimit: { [Op.gt]: 0 }
        },
        include: [
            {
                model: FinanceCategory,
                as: 'category',
                attributes: ['id', 'name']
            },
            {
                model: User,
                as: 'user',
                attributes: ['id', 'name', 'email', 'role'],
                include: [
                    {
                        model: UserNotificationPreference,
                        as: 'notificationPreference',
                        attributes: ['emailEnabled', 'scheduledEnabled']
                    }
                ]
            }
        ]
    });

    const alerts = [];

    for (const budget of budgets) {
        try {
            const triggered = await evaluateBudget(budget, now);
            if (Array.isArray(triggered) && triggered.length) {
                alerts.push(...triggered);
            }
        } catch (error) {
            console.error(`Erro ao processar orçamento ${budget?.id}:`, error);
        }
    }

    return {
        processedBudgets: budgets.length,
        triggeredAlerts: alerts
    };
};

module.exports = {
    processBudgetAlerts
};
