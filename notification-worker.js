require('dotenv').config();

const { sequelize } = require('./database/models');
const { startWorker, stopWorker } = require('./src/services/notificationWorker');

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
        console.error('Erro ao finalizar o worker de notificações:', error);
        exitCode = exitCode || 1;
    } finally {
        process.exit(exitCode);
    }
};

(async () => {
    try {
        await sequelize.authenticate();
        console.log('Conexão estabelecida para o worker de notificações.');
        startWorker({ immediate: true });
    } catch (error) {
        console.error('Falha ao iniciar o worker de notificações:', error);
        await gracefulShutdown(1);
    }
})();

process.on('SIGINT', () => gracefulShutdown(0));
process.on('SIGTERM', () => gracefulShutdown(0));
process.on('uncaughtException', (error) => {
    console.error('Exceção não tratada no worker de notificações:', error);
    void gracefulShutdown(1);
});
process.on('unhandledRejection', (reason) => {
    console.error('Rejeição não tratada no worker de notificações:', reason);
    void gracefulShutdown(1);
});
