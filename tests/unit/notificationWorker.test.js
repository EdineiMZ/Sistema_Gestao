process.env.NODE_ENV = 'test';

const mockSchedule = jest.fn();
const mockProcessBudgetAlerts = jest.fn();
const mockProcessNotifications = jest.fn();

jest.mock('node-cron', () => ({
    schedule: (...args) => mockSchedule(...args),
}));

jest.mock('../../src/services/budgetAlertService', () => ({
    processBudgetAlerts: (...args) => mockProcessBudgetAlerts(...args),
}));

jest.mock('../../src/services/notificationService', () => ({
    processNotifications: (...args) => mockProcessNotifications(...args),
}));

describe('notificationWorker', () => {
    let workerModule;
    let scheduledCallback = null;

    const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

    beforeEach(() => {
        jest.resetModules();
        scheduledCallback = null;

        mockSchedule.mockReset();
        mockSchedule.mockImplementation((expression, handler) => {
            scheduledCallback = handler;
            return {
                stop: jest.fn(),
                destroy: jest.fn(),
            };
        });

        mockProcessBudgetAlerts.mockReset();
        mockProcessBudgetAlerts.mockResolvedValue({ processedAlerts: 2 });
        mockProcessNotifications.mockReset();
        mockProcessNotifications.mockResolvedValue(undefined);

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

        expect(mockProcessBudgetAlerts).toHaveBeenCalledTimes(1);
        expect(mockProcessNotifications).toHaveBeenCalledTimes(1);
        expect(mockSchedule).toHaveBeenCalledTimes(1);
        expect(typeof scheduledCallback).toBe('function');

        await scheduledCallback();
        expect(mockProcessBudgetAlerts).toHaveBeenCalledTimes(2);
        expect(mockProcessNotifications).toHaveBeenCalledTimes(2);
    });

    it('mantém o ciclo ativo quando o serviço de alertas falha', async () => {
        const failure = new Error('budget-failure');
        mockProcessBudgetAlerts.mockRejectedValueOnce(failure);

        await workerModule.__testUtils.runWorkerCycle();

        expect(mockProcessNotifications).toHaveBeenCalledTimes(1);
        const metrics = workerModule.getWorkerMetrics();
        expect(metrics.budgetAlertFailures).toBeGreaterThanOrEqual(1);
        expect(metrics.cyclesCompleted).toBe(1);
    });
});
