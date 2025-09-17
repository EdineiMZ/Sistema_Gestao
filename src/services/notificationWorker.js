const cron = require('node-cron');
const { processNotifications } = require('./notificationService');

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
        console.error('Erro ao executar worker de notificações:', error);
    }
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
        console.error('Falha ao iniciar o agendador de notificações:', error);
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
};
