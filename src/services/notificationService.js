// src/services/notificationService.js
const { Notification, User, Appointment, sequelize } = require('../../database/models');
const { sendEmail } = require('../utils/email');
const { replacePlaceholders } = require('../utils/placeholderUtils');
const { Op } = require('sequelize');

/**
 * Processa todas as notificações ativas (não enviadas) que estão agendadas para disparo.
 */
async function processNotifications() {
    try {
        const now = new Date();

        // Busca notificações ativas, não enviadas, com triggerDate nulo ou menor ou igual a agora.
        const notifications = await Notification.findAll({
            where: {
                active: true,
                sent: false,
                [Op.or]: [
                    { triggerDate: null },
                    { triggerDate: { [Op.lte]: now } }
                ]
            }
        });

        for (const notif of notifications) {
            if (notif.type === 'birthday') {
                await processBirthdayNotification(notif);
            } else if (notif.type === 'appointment') {
                await processAppointmentNotification(notif);
            } else {
                await processCustomNotification(notif);
            }
            // Após o envio, marca a notificação como enviada
            await notif.update({ sent: true });
        }
    } catch (err) {
        console.error('Erro ao processar notificações:', err);
    }
}

/**
 * Processa notificações do tipo 'birthday'
 * Envia e-mail somente para os usuários cujo aniversário (mês e dia) coincide com a data atual.
 */
async function processBirthdayNotification(notif) {
    const now = new Date();
    // Formata a data atual no formato MM-DD
    const today = now.toISOString().slice(5, 10); // Ex: "04-15"

    // Busca usuários ativos cujo dateOfBirth (formato 'YYYY-MM-DD') tem o mesmo MM-DD
    const users = await User.findAll({
        where: sequelize.where(
            sequelize.fn('to_char', sequelize.col('dateOfBirth'), 'MM-DD'),
            today
        )
    });

    for (const u of users) {
        const finalMsg = replacePlaceholders(notif.message, u, null);
        await sendEmail(u.email, notif.title, finalMsg);
    }
}

/**
 * Processa notificações do tipo 'appointment'
 * Exemplo: envia lembrete para agendamentos que começam em até 1 hora.
 */
async function processAppointmentNotification(notif) {
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);

    const appointments = await Appointment.findAll({
        where: {
            start: { [Op.lte]: oneHourFromNow },
            status: 'scheduled'
        },
        include: [{ model: User, as: 'professional' }]
    });

    for (const app of appointments) {
        if (app.clientEmail) {
            const finalMsg = replacePlaceholders(notif.message, null, app);
            await sendEmail(app.clientEmail, notif.title, finalMsg);
        }
        if (app.professional) {
            const finalMsgPro = replacePlaceholders(notif.message, app.professional, app);
            await sendEmail(app.professional.email, notif.title, finalMsgPro);
        }
    }
}

/**
 * Processa notificações customizadas.
 * Se sendToAll for verdadeiro, envia para todos os usuários ativos;
 * caso contrário, envia para o usuário específico definido em notif.userId.
 */
async function processCustomNotification(notif) {
    if (notif.sendToAll) {
        const allUsers = await User.findAll({ where: { active: true } });
        for (const u of allUsers) {
            const finalMsg = replacePlaceholders(notif.message, u, null);
            await sendEmail(u.email, notif.title, finalMsg);
        }
    } else if (notif.userId) {
        const user = await User.findByPk(notif.userId);
        if (user) {
            const finalMsg = replacePlaceholders(notif.message, user, null);
            await sendEmail(user.email, notif.title, finalMsg);
        }
    }
}

module.exports = {
    processNotifications
};
