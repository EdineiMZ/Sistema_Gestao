const cron = require('node-cron');
const { processNotifications } = require('./notificationService');
const { processBudgetAlerts } = require('./budgetAlertService');
const logger = require('../utils/logger');

const DEFAULT_CRON_EXPRESSION = process.env.NOTIFICATION_CRON || '*/1 * * * *';

let cronTask = null;
let activeExpression = null;

const runProcessNotifications = async () => {
    const startedAt = Date.now();
    console.log('[Worker] Iniciando ciclo de notificações (inclui alertas de orçamento).');
    try {
        await processNotifications();
        const duration = Date.now() - startedAt;
        console.log(`[Worker] Ciclo de notificações concluído em ${duration}ms.`);
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
                console.log('[Worker] Execução imediata solicitada.');
                void runProcessNotifications();
            }
            return cronTask;
        }

        stopWorker();
    }

    try {
        cronTask = cron.schedule(expression, () => {
            console.log(`[Worker] Disparando ciclo agendado (${expression}).`);
            void runProcessNotifications();
        });
        activeExpression = expression;
    } catch (error) {
        logger.error('notification-worker.schedule.failure', { error });
        throw error;
    }

    if (immediate) {
        console.log('[Worker] Execução imediata solicitada.');
        void runProcessNotifications();

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
