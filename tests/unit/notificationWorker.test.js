process.env.NODE_ENV = 'test';

const scheduleMock = jest.fn();
const processBudgetAlertsMock = jest.fn();
const processNotificationsMock = jest.fn();

jest.mock('node-cron', () => ({
    schedule: (...args) => scheduleMock(...args),
}));

jest.mock('../../src/services/budgetAlertService', () => ({
    processBudgetAlerts: (...args) => processBudgetAlertsMock(...args),
}));

jest.mock('../../src/services/notificationService', () => ({
    processNotifications: (...args) => processNotificationsMock(...args),
}));

describe('notificationWorker', () => {
    let workerModule;
    let scheduledCallback = null;

    const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

    beforeEach(() => {
        jest.resetModules();
        scheduledCallback = null;

        scheduleMock.mockReset();
        scheduleMock.mockImplementation((expression, handler) => {
            scheduledCallback = handler;
            return {
                stop: jest.fn(),
                destroy: jest.fn(),
            };
        });

        processBudgetAlertsMock.mockReset();
        processBudgetAlertsMock.mockResolvedValue({ processedAlerts: 2 });
        processNotificationsMock.mockReset();
        processNotificationsMock.mockResolvedValue(undefined);

        workerModule = require('../../src/services/notificationWorker');
        workerModule.__testUtils.resetMetrics();
    });

    afterEach(() => {
        if (workerModule) {
            workerModule.stopWorker();
        }
        jest.clearAllMocks();
    });

    it('executa alertas de orçamento e notificações em cada ciclo', async () => {
        workerModule.startWorker({ immediate: true, cronExpression: '* * * * *' });
        await flushPromises();

        expect(processBudgetAlertsMock).toHaveBeenCalledTimes(1);
        expect(processNotificationsMock).toHaveBeenCalledTimes(1);
        expect(scheduleMock).toHaveBeenCalledTimes(1);
        expect(typeof scheduledCallback).toBe('function');

        await scheduledCallback();
        expect(processBudgetAlertsMock).toHaveBeenCalledTimes(2);
        expect(processNotificationsMock).toHaveBeenCalledTimes(2);
    });

    it('mantém o ciclo ativo quando o serviço de alertas falha', async () => {
        const failure = new Error('budget-failure');
        processBudgetAlertsMock.mockRejectedValueOnce(failure);

        await workerModule.__testUtils.runWorkerCycle();

        expect(processNotificationsMock).toHaveBeenCalledTimes(1);
        const metrics = workerModule.getWorkerMetrics();
        expect(metrics.budgetAlertFailures).toBeGreaterThanOrEqual(1);
        expect(metrics.cyclesCompleted).toBe(1);
    });
});
