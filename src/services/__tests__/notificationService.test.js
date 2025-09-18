process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');

const models = require('../../../database/models');
const { Notification, NotificationDispatchLog, sequelize } = models;

const resolveNotificationService = () => require.resolve('../notificationService');
const resolveBudgetAlertService = () => require.resolve('../budgetAlertService');
const resolveEmailUtil = () => require.resolve('../../utils/email');
const resolveLogger = () => require.resolve('../../utils/logger');

const resetLoggerModule = () => {
    delete require.cache[resolveLogger()];
};

const loadNotificationService = () => {
    resetLoggerModule();
    delete require.cache[resolveNotificationService()];
    return require('../notificationService');
};

const mockModule = (modulePath, mockExports) => {
    const resolved = require.resolve(modulePath);
    const original = require.cache[resolved];
    require.cache[resolved] = {
        id: resolved,
        filename: resolved,
        loaded: true,
        exports: mockExports
    };
    return () => {
        if (original) {
            require.cache[resolved] = original;
        } else {
            delete require.cache[resolved];
        }
    };
};

const resetNotificationServiceCache = () => {
    delete require.cache[resolveNotificationService()];
};

test('processNotifications aborta quando coluna messageHtml está ausente', async (t) => {
    const originalLoggerSilent = process.env.LOGGER_SILENT;
    process.env.LOGGER_SILENT = 'false';
    const { processNotifications } = loadNotificationService();

    let describeCalls = 0;
    const originalGetQueryInterface = sequelize.getQueryInterface;
    const queryInterface = {
        describeTable: async (tableName) => {
            describeCalls += 1;
            assert.strictEqual(tableName, 'Notifications');
            return { id: {}, title: {} };
        }
    };
    sequelize.getQueryInterface = () => queryInterface;

    const originalFindAll = Notification.findAll;
    const originalDispatchFindAll = NotificationDispatchLog.findAll;
    const originalDispatchCreate = NotificationDispatchLog.create;
    let findAllCalled = false;
    Notification.findAll = async () => {
        findAllCalled = true;
        return [];
    };

    NotificationDispatchLog.findAll = async () => [];
    NotificationDispatchLog.create = async () => {};

    const warnings = [];
    const originalConsoleWarn = console.warn;
    console.warn = (...args) => {
        warnings.push(args.join(' '));
    };

    t.after(() => {
        sequelize.getQueryInterface = originalGetQueryInterface;
        Notification.findAll = originalFindAll;
        NotificationDispatchLog.findAll = originalDispatchFindAll;
        NotificationDispatchLog.create = originalDispatchCreate;
        console.warn = originalConsoleWarn;
        process.env.LOGGER_SILENT = originalLoggerSilent;
        resetLoggerModule();
        resetNotificationServiceCache();
    });

    await processNotifications();
    await processNotifications();

    assert.strictEqual(describeCalls, 2);
    assert.strictEqual(findAllCalled, false);
    assert.strictEqual(warnings.length, 1);
    assert.match(warnings[0], /messageHtml/);
});


test('processNotifications integra budgetAlertService e deduplica envios por ciclo', async (t) => {
    const dispatchLogs = [];
    const sendEmailCalls = [];
    let budgetServiceCalls = 0;

    const alertUser = {
        id: 77,
        name: 'Finance Lead',
        email: 'finance@example.com',
        role: 'manager',
        active: true,
        notificationPreference: {
            emailEnabled: true,
            scheduledEnabled: true
        }
    };

    const alertSummary = {
        budgetId: 11,
        categoryId: 42,
        categoryName: 'Marketing',
        month: '2024-01',
        monthLabel: 'janeiro de 2024',
        monthlyLimit: 1000,
        consumption: 925,
        remaining: 75,
        percentage: 92.5,
        status: 'warning',
        statusLabel: 'Atenção',
        statusMeta: { key: 'warning', label: 'Atenção' }
    };

    const restoreEmail = mockModule('../../utils/email', {
        sendEmail: async (...args) => {
            sendEmailCalls.push(args);
        }
    });

    const restoreBudgetService = mockModule('../budgetAlertService', {
        collectBudgetAlerts: async () => {
            budgetServiceCalls += 1;
            return [{
                user: alertUser,
                summary: alertSummary,
                extras: {
                    budgetCategoryName: alertSummary.categoryName,
                    budgetMonthLabel: alertSummary.monthLabel
                }
            }];
        }
    });

    const { processNotifications } = loadNotificationService();

    const originalGetQueryInterface = sequelize.getQueryInterface;
    const queryInterface = {
        describeTable: async (tableName) => {
            assert.strictEqual(tableName, 'Notifications');
            return { id: {}, messageHtml: {} };
        }
    };
    sequelize.getQueryInterface = () => queryInterface;

    const originalFindAll = Notification.findAll;
    const originalDispatchFindAll = NotificationDispatchLog.findAll;
    const originalDispatchCreate = NotificationDispatchLog.create;

    const notificationRecord = {
        id: 501,
        type: 'budget-alert',
        title: 'Alerta de orçamento',
        message: 'Seu orçamento está em atenção.',
        messageHtml: '<p>Seu orçamento está em atenção.</p>',
        repeatFrequency: 'none',
        triggerDate: new Date('2024-01-01T00:00:00Z'),
        createdAt: new Date('2023-12-10T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
        filters: {},
        sent: false,
        accentColor: '#0d6efd',
        previewText: 'Orçamento em atenção',
        async update(values) {
            Object.assign(this, values);
            return this;
        }
    };

    Notification.findAll = async () => [notificationRecord];
    NotificationDispatchLog.findAll = async () => dispatchLogs.map((entry) => ({
        recipient: entry.recipient,
        contextHash: entry.contextHash
    }));
    NotificationDispatchLog.create = async (payload) => {
        dispatchLogs.push({ recipient: payload.recipient, contextHash: payload.contextHash });
        return payload;
    };

    t.after(() => {
        sequelize.getQueryInterface = originalGetQueryInterface;
        Notification.findAll = originalFindAll;
        NotificationDispatchLog.findAll = originalDispatchFindAll;
        NotificationDispatchLog.create = originalDispatchCreate;
        restoreEmail();
        restoreBudgetService();
        dispatchLogs.splice(0, dispatchLogs.length);
        sendEmailCalls.splice(0, sendEmailCalls.length);
        resetNotificationServiceCache();
        delete require.cache[resolveBudgetAlertService()];
        delete require.cache[resolveEmailUtil()];
    });

    await processNotifications();
    await processNotifications();

    assert.strictEqual(budgetServiceCalls, 2, 'serviço de orçamento deve ser chamado a cada ciclo');
    assert.strictEqual(dispatchLogs.length, 1, 'deve registrar apenas um envio por ciclo');
    assert.strictEqual(sendEmailCalls.length, 1, 'deve enviar apenas um e-mail');
    assert.strictEqual(sendEmailCalls[0][0], 'finance@example.com');
});
