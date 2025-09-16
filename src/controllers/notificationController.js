// src/controllers/notificationController.js
const { Notification, User } = require('../../database/models');

module.exports = {
    // Lista todas as notificações
    listNotifications: async (req, res) => {
        try {
            const notifications = await Notification.findAll({
                order: [['id', 'DESC']]
            });
            res.render('notifications/manageNotifications', { notifications });
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao listar notificações.');
            return res.redirect('/');
        }
    },

    // Exibir form de criação
    showCreate: async (req, res) => {
        try {
            // Caso queira exibir lista de usuários para userId
            const users = await User.findAll({ where: { active: true } });
            res.render('notifications/createNotification', { users });
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao exibir form de notificação.');
            return res.redirect('/notifications');
        }
    },

    // Criar
    createNotification: async (req, res) => {
        try {
            const { title, message, type, triggerDate, active, userId, sendToAll } = req.body;

            await Notification.create({
                title,
                message,
                type,
                triggerDate: triggerDate || null,
                active: (active === 'true'),
                userId: userId ? Number(userId) : null,
                sendToAll: (sendToAll === 'true')
            });

            req.flash('success_msg', 'Notificação criada com sucesso!');
            return res.redirect('/notifications');
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao criar notificação.');
            return res.redirect('/notifications');
        }
    },

    // Exibir form de edição
    showEdit: async (req, res) => {
        try {
            const { id } = req.params;
            const notif = await Notification.findByPk(id);
            if (!notif) {
                req.flash('error_msg', 'Notificação não encontrada.');
                return res.redirect('/notifications');
            }
            const users = await User.findAll({ where: { active: true } });
            res.render('notifications/editNotification', { notif, users });
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao exibir edição.');
            return res.redirect('/notifications');
        }
    },

    // Atualizar
    updateNotification: async (req, res) => {
        try {
            const { id } = req.params;
            const { title, message, type, triggerDate, active, userId, sendToAll } = req.body;

            const notif = await Notification.findByPk(id);
            if (!notif) {
                req.flash('error_msg', 'Notificação não encontrada.');
                return res.redirect('/notifications');
            }

            notif.title = title;
            notif.message = message;
            notif.type = type;
            notif.triggerDate = triggerDate || null;
            notif.active = (active === 'true');
            notif.userId = userId ? Number(userId) : null;
            notif.sendToAll = (sendToAll === 'true');

            await notif.save();
            req.flash('success_msg', 'Notificação atualizada com sucesso!');
            return res.redirect('/notifications');
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao atualizar notificação.');
            return res.redirect('/notifications');
        }
    },

    // Excluir
    deleteNotification: async (req, res) => {
        try {
            const { id } = req.params;
            const notif = await Notification.findByPk(id);
            if (!notif) {
                req.flash('error_msg', 'Notificação não encontrada.');
                return res.redirect('/notifications');
            }
            await notif.destroy();
            req.flash('success_msg', 'Notificação removida.');
            return res.redirect('/notifications');
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao excluir notificação.');
            return res.redirect('/notifications');
        }
    }
};
