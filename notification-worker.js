require('dotenv').config();

const { sequelize } = require('./database/models');
const { startWorker, stopWorker, getWorkerMetrics } = require('./src/services/notificationWorker');
const logger = require('./src/utils/logger');

let shuttingDown = false;

const gracefulShutdown = async (exitCode = 0) => {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;

    try {
        stopWorker();
        await sequelize.close();
    } catch (error) {
        logger.error('notification-worker.shutdown.failure', { error });
        exitCode = exitCode || 1;
    } finally {
        logger.info('notification-worker.shutdown.metrics', getWorkerMetrics());
        process.exit(exitCode);
    }
};

(async () => {
    try {
        await sequelize.authenticate();
        logger.info('notification-worker.bootstrap.success');
        startWorker({ immediate: true });
    } catch (error) {
        logger.error('notification-worker.bootstrap.failure', { error });
        await gracefulShutdown(1);
    }
})();

process.on('SIGINT', () => gracefulShutdown(0));
process.on('SIGTERM', () => gracefulShutdown(0));
process.on('uncaughtException', (error) => {
    logger.error('notification-worker.uncaught-exception', { error });
    void gracefulShutdown(1);
});
process.on('unhandledRejection', (reason) => {
    logger.error('notification-worker.unhandled-rejection', { reason });
    void gracefulShutdown(1);
});
