// src/index.js (ou outro)
const cron = require('node-cron');
const { processNotifications } = require('./services/notificationService');

cron.schedule('*/5 * * * *', () => {
    console.log('Processando notificações a cada 5 minutos...');
    processNotifications();
});
