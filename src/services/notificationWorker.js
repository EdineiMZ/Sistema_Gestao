const cron = require('node-cron');
const { processNotifications } = require('./notificationService');
const { processBudgetAlerts } = require('./budgetAlertService');
const logger = require('../utils/logger');

const DEFAULT_CRON_EXPRESSION = process.env.NOTIFICATION_CRON || '*/1 * * * *';

let cronTask = null;
let activeExpression = null;

const workerMetrics = {
    cyclesStarted: 0,
    cyclesCompleted: 0,
    budgetAlertRuns: 0,
    budgetAlertFailures: 0,
    budgetAlertsProcessed: 0,
    notificationRuns: 0,
    notificationFailures: 0,
};

const extractProcessedCount = (result) => {
    if (!result) {
        return 0;
    }

    if (typeof result === 'number' && Number.isFinite(result)) {
        return result;
    }

    if (typeof result === 'object') {
        for (const key of ['processedAlerts', 'processed', 'count', 'totalProcessed']) {
            if (typeof result[key] === 'number' && Number.isFinite(result[key])) {
                return result[key];
            }
        }
    }

    return 0;
};

const getMetricsSnapshot = () => ({ ...workerMetrics });

const resetMetrics = () => {
    Object.keys(workerMetrics).forEach((key) => {
        workerMetrics[key] = 0;
    });
};

const runWorkerCycle = async () => {
    const cycleId = `${Date.now()}:${Math.random().toString(16).slice(2, 8)}`;
    const startedAt = Date.now();

    workerMetrics.cyclesStarted += 1;
    logger.info('notification-worker.cycle.start', {
        cycleId,
        cronExpression: activeExpression,
        metrics: getMetricsSnapshot(),
    });

    let budgetAlertsProcessed = 0;

    workerMetrics.budgetAlertRuns += 1;
    try {
        const budgetResult = await processBudgetAlerts();
        budgetAlertsProcessed = extractProcessedCount(budgetResult);
        workerMetrics.budgetAlertsProcessed += budgetAlertsProcessed;
        logger.debug('notification-worker.cycle.budget-alerts.success', {
            cycleId,
            processed: budgetAlertsProcessed,
        });
    } catch (error) {
        workerMetrics.budgetAlertFailures += 1;
        logger.error('notification-worker.cycle.budget-alerts.failure', {
            cycleId,
            error,
        });
    }

    workerMetrics.notificationRuns += 1;
    try {
        await processNotifications();
        logger.debug('notification-worker.cycle.notifications.success', {
            cycleId,
        });
    } catch (error) {
        workerMetrics.notificationFailures += 1;
        logger.error('notification-worker.cycle.notifications.failure', {
            cycleId,
            error,
        });
    }

    workerMetrics.cyclesCompleted += 1;
    const finishedAt = Date.now();
    logger.info('notification-worker.cycle.finish', {
        cycleId,
        durationMs: finishedAt - startedAt,
        budgetAlertsProcessed,
        metrics: getMetricsSnapshot(),
    });
};

function startWorker({ immediate = false, cronExpression } = {}) {
    const expression = cronExpression || DEFAULT_CRON_EXPRESSION;

    if (cronTask) {
        if (activeExpression === expression) {
            if (immediate) {
                logger.info('notification-worker.cycle.immediate');
                void runWorkerCycle();
            }
            return cronTask;
        }

        stopWorker();
    }

    try {
        cronTask = cron.schedule(expression, () => {
            logger.info('notification-worker.cycle.triggered', {
                cronExpression: expression,
            });
            void runWorkerCycle();
        });
        activeExpression = expression;
    } catch (error) {
        logger.error('notification-worker.schedule.failure', { error });
        throw error;
    }

    if (immediate) {
        logger.info('notification-worker.cycle.immediate');
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
