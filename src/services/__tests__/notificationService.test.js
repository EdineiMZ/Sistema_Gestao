process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');

const models = require('../../../database/models');
const { processNotifications } = require('../notificationService');

const { Notification, NotificationDispatchLog, sequelize } = models;

test('processNotifications aborta quando coluna messageHtml está ausente', async (t) => {
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
    });

    await processNotifications();
    await processNotifications();

    assert.strictEqual(describeCalls, 2);
    assert.strictEqual(findAllCalled, false);
    assert.strictEqual(warnings.length, 1);
    assert.match(warnings[0], /messageHtml/);
});
