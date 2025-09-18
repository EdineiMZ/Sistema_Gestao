const cron = require('node-cron');
const { processNotifications } = require('./notificationService');
const { processBudgetAlerts } = require('./budgetAlertService');
const logger = require('../utils/logger');

const DEFAULT_CRON_EXPRESSION = process.env.NOTIFICATION_CRON || '*/1 * * * *';

let cronTask = null;
let activeExpression = null;

const INITIAL_METRICS = () => ({
    cyclesCompleted: 0,
    budgetAlertFailures: 0,
    notificationFailures: 0,
    totalBudgetAlertsProcessed: 0,
    lastCycleId: null,
    lastCycleStartedAt: null,
    lastCycleFinishedAt: null,
    lastRunDurationMs: null,
});

let workerMetrics = INITIAL_METRICS();
let cycleCounter = 0;

const getMetricsSnapshot = () => ({ ...workerMetrics });

const resetMetrics = () => {
    workerMetrics = INITIAL_METRICS();
    cycleCounter = 0;
};

const runWorkerCycle = async () => {
    const cycleId = `cycle-${++cycleCounter}`;
    const startedAt = Date.now();
    workerMetrics.lastCycleStartedAt = startedAt;

    console.log('[Worker] Iniciando ciclo de notificações (inclui alertas de orçamento).');

    let budgetAlertsProcessed = 0;

    try {
        const budgetResult = await processBudgetAlerts();
        budgetAlertsProcessed = Number(budgetResult?.processedAlerts) || 0;
        workerMetrics.totalBudgetAlertsProcessed += budgetAlertsProcessed;
    } catch (error) {
        workerMetrics.budgetAlertFailures += 1;
        logger.error('notification-worker.cycle.budget-alerts.failure', {
            cycleId,
            error,
        });
    }

    try {
        await processNotifications();
    } catch (error) {
        workerMetrics.notificationFailures += 1;
        logger.error('notification-worker.cycle.notifications.failure', {
            cycleId,
            error,
        });
    }

    workerMetrics.cyclesCompleted += 1;

    const finishedAt = Date.now();
    const durationMs = finishedAt - startedAt;

    workerMetrics.lastCycleId = cycleId;
    workerMetrics.lastCycleFinishedAt = finishedAt;
    workerMetrics.lastRunDurationMs = durationMs;

    logger.info('notification-worker.cycle.finish', {
        cycleId,
        durationMs,
        budgetAlertsProcessed,
        metrics: getMetricsSnapshot(),
    });

    return {
        cycleId,
        durationMs,
        budgetAlertsProcessed,
    };
};

function startWorker({ immediate = false, cronExpression } = {}) {
    const expression = cronExpression || DEFAULT_CRON_EXPRESSION;

    if (cronTask) {
        if (activeExpression === expression) {
            if (immediate) {
                console.log('[Worker] Execução imediata solicitada.');
                void runWorkerCycle();
            }
            return cronTask;
        }

        stopWorker();
    }

    try {
        cronTask = cron.schedule(expression, () => {
            console.log(`[Worker] Disparando ciclo agendado (${expression}).`);
            void runWorkerCycle();
        });
        activeExpression = expression;
    } catch (error) {
        logger.error('notification-worker.schedule.failure', { error });
        throw error;
    }

    if (immediate) {
        console.log('[Worker] Execução imediata solicitada.');
        void runWorkerCycle();

    }

    return cronTask;
}

function stopWorker() {
    if (cronTask) {
        cronTask.stop();
        if (typeof cronTask.destroy === 'function') {
            cronTask.destroy();
        }
        cronTask = null;
        activeExpression = null;
    }
}

module.exports = {
    startWorker,
    stopWorker,
    getWorkerMetrics: getMetricsSnapshot,
    __testUtils: {
        runWorkerCycle,
        getMetrics: getMetricsSnapshot,
        resetMetrics,
    },
};
