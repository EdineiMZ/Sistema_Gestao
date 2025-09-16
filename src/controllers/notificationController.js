// src/controllers/notificationController.js
const sanitizeHtml = require('sanitize-html');

const { Op } = require('sequelize');
const { Notification, User, Procedure, Room } = require('../../database/models');
const { buildQueryFilters } = require('../utils/queryBuilder');

const parseBoolean = (value, defaultValue = false) => {
    if (Array.isArray(value)) {
        return value.some((entry) => parseBoolean(entry, defaultValue));
    }
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    const normalized = String(value).toLowerCase();
    return ['true', '1', 'on', 'yes'].includes(normalized);
};

const parseNumberArray = (value) => {
    if (!value) return [];
    const source = Array.isArray(value) ? value : [value];
    return source
        .map((item) => Number.parseInt(item, 10))
        .filter((num) => Number.isInteger(num));
};

const parseStringArray = (value) => {
    if (!value) return [];
    const source = Array.isArray(value) ? value : [value];
    return source
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0);
};

const parseDecimal = (value) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const parsed = Number.parseFloat(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
};

const parseDateInput = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const sanitizeRichText = (value) => {
    if (!value) return null;
    return sanitizeHtml(value, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'h3', 'img', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'span']),
        allowedAttributes: {
            '*': ['style', 'class'],
            a: ['href', 'name', 'target', 'rel'],
            img: ['src', 'alt', 'width', 'height']
        },
        allowedSchemes: ['http', 'https', 'mailto']
    });
};

const frequencyLabels = {
    none: 'Não repetir',
    daily: 'Diariamente',
    weekly: 'Semanalmente',
    monthly: 'Mensalmente'
};

const buildFiltersFromRequest = (body) => {
    const filters = {};
    const roles = parseNumberArray(body.targetRoles);
    if (roles.length) {
        filters.targetRoles = roles;
    }

    filters.onlyActive = parseBoolean(body.onlyActive, true);

    const minCredit = parseDecimal(body.minimumCreditBalance);
    if (minCredit !== null) {
        filters.minimumCreditBalance = minCredit;
    }

    const appointmentStatus = parseStringArray(body.appointmentStatus);
    if (appointmentStatus.length) {
        filters.appointmentStatus = appointmentStatus;
    }

    const timeWindow = Number.parseInt(body.timeWindowMinutes, 10);
    if (Number.isInteger(timeWindow) && timeWindow > 0) {
        filters.timeWindowMinutes = timeWindow;
    }

    const procedureId = Number.parseInt(body.procedureId, 10);
    if (Number.isInteger(procedureId)) {
        filters.procedureId = procedureId;
    }

    const roomId = Number.parseInt(body.roomId, 10);
    if (Number.isInteger(roomId)) {
        filters.roomId = roomId;
    }

    const dateRangeStart = parseDateInput(body.dateRangeStart);
    if (dateRangeStart) {
        filters.dateRangeStart = dateRangeStart;
    }

    const dateRangeEnd = parseDateInput(body.dateRangeEnd);
    if (dateRangeEnd) {
        filters.dateRangeEnd = dateRangeEnd;
    }

    if (body.clientEmailDomain) {
        filters.clientEmailDomain = String(body.clientEmailDomain).trim().toLowerCase();
    }

    filters.includeProfessional = parseBoolean(body.includeProfessional, true);
    filters.includeClient = parseBoolean(body.includeClient, true);

    return filters;
};

const formatFiltersForView = (filters = {}) => {
    if (!filters || Object.keys(filters).length === 0) {
        return ['Sem filtros adicionais'];
    }

    const descriptions = [];
    if (filters.onlyActive) descriptions.push('Somente usuários ativos');
    if (filters.targetRoles?.length) descriptions.push(`Níveis: ${filters.targetRoles.join(', ')}`);
    if (filters.minimumCreditBalance !== undefined) descriptions.push(`Crédito mínimo: R$ ${filters.minimumCreditBalance}`);
    if (filters.appointmentStatus?.length) descriptions.push(`Status agendamento: ${filters.appointmentStatus.join(', ')}`);
    if (filters.procedureId) descriptions.push(`Procedimento ID: ${filters.procedureId}`);
    if (filters.roomId) descriptions.push(`Sala ID: ${filters.roomId}`);
    if (filters.timeWindowMinutes) descriptions.push(`Janela: ${filters.timeWindowMinutes} min`);
    if (filters.dateRangeStart || filters.dateRangeEnd) {
        descriptions.push(`Período: ${filters.dateRangeStart || 'início'} até ${filters.dateRangeEnd || 'sem fim'}`);
    }
    if (filters.clientEmailDomain) descriptions.push(`Domínio cliente: ${filters.clientEmailDomain}`);
    if (filters.includeProfessional === false) descriptions.push('Sem e-mail do profissional');
    if (filters.includeClient === false) descriptions.push('Sem e-mail do cliente');

    return descriptions.length ? descriptions : ['Sem filtros adicionais'];
};

module.exports = {
    // Lista todas as notificações
    listNotifications: async (req, res) => {
        try {
            const { where, filters, metadata } = buildQueryFilters(req.query, {
                statusField: 'active',
                statusMap: {
                    active: true,
                    inactive: false
                },
                allowedStatuses: [true, false],
                defaultStatus: 'all',
                dateField: 'triggerDate',
                keywordFields: ['title', 'message']
            });

            if (metadata.orConditions.length) {
                where[Op.or] = metadata.orConditions;
            }

            const notifications = await Notification.findAll({
                where,
                order: [['id', 'DESC']]
            });

            const formattedNotifications = notifications.map((notification) => {
                const plain = notification.get({ plain: true });
                return {
                    ...plain,
                    filtersSummary: formatFiltersForView(plain.filters),
                    repeatFrequencyLabel: frequencyLabels[plain.repeatFrequency] || plain.repeatFrequency
                };
            });

            res.render('notifications/manageNotifications', {
                pageTitle: 'Notificações automatizadas',
                notifications: formattedNotifications,
                filters
            });
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao listar notificações.');
            return res.redirect('/');
        }
    },

    // Exibir form de criação
    showCreate: async (req, res) => {
        try {
            const [users, procedures, rooms] = await Promise.all([
                User.findAll({ where: { active: true }, order: [['name', 'ASC']] }),
                Procedure.findAll({ where: { active: true }, order: [['name', 'ASC']] }),
                Room.findAll({ where: { active: true }, order: [['name', 'ASC']] })
            ]);

            res.render('notifications/createNotification', {
                pageTitle: 'Criar notificação',
                users,
                procedures,
                rooms,
                defaultFilters: {
                    onlyActive: true,
                    includeProfessional: true,
                    includeClient: true,
                    timeWindowMinutes: 60
                },
                frequencyLabels
            });
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao exibir form de notificação.');
            return res.redirect('/notifications');
        }
    },

    // Criar
    createNotification: async (req, res) => {
        try {
            const { title, message, messageHtml, type, triggerDate, active, userId, sendToAll, repeatFrequency, accentColor, previewText } = req.body;

            const filters = buildFiltersFromRequest(req.body);
            const normalizedTriggerDate = parseDateInput(triggerDate);
            const sanitizedFrequency = Object.prototype.hasOwnProperty.call(frequencyLabels, repeatFrequency)
                ? repeatFrequency
                : 'none';

            await Notification.create({
                title: title?.trim(),
                message: message?.trim(),
                messageHtml: sanitizeRichText(messageHtml),
                type,
                triggerDate: normalizedTriggerDate,
                active: parseBoolean(active, true),
                userId: userId ? Number.parseInt(userId, 10) : null,
                sendToAll: parseBoolean(sendToAll, false),
                filters,
                repeatFrequency: sanitizedFrequency,
                accentColor: accentColor || '#0d6efd',
                previewText: previewText ? previewText.trim() : null
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
            const [users, procedures, rooms] = await Promise.all([
                User.findAll({ where: { active: true }, order: [['name', 'ASC']] }),
                Procedure.findAll({ where: { active: true }, order: [['name', 'ASC']] }),
                Room.findAll({ where: { active: true }, order: [['name', 'ASC']] })
            ]);

            const plainNotif = notif.get({ plain: true });
            plainNotif.filters = plainNotif.filters || {};

            res.render('notifications/editNotification', {
                pageTitle: 'Editar notificação',
                notif: plainNotif,
                users,
                procedures,
                rooms,
                frequencyLabels
            });
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
            const { title, message, messageHtml, type, triggerDate, active, userId, sendToAll, repeatFrequency, accentColor, previewText } = req.body;

            const notif = await Notification.findByPk(id);
            if (!notif) {
                req.flash('error_msg', 'Notificação não encontrada.');
                return res.redirect('/notifications');
            }

            const filters = buildFiltersFromRequest(req.body);
            const normalizedTriggerDate = parseDateInput(triggerDate);
            const sanitizedFrequency = Object.prototype.hasOwnProperty.call(frequencyLabels, repeatFrequency)
                ? repeatFrequency
                : 'none';

            notif.title = title?.trim();
            notif.message = message?.trim();
            notif.messageHtml = sanitizeRichText(messageHtml);
            notif.type = type;
            notif.triggerDate = normalizedTriggerDate;
            notif.active = parseBoolean(active, true);
            notif.userId = userId ? Number.parseInt(userId, 10) : null;
            notif.sendToAll = parseBoolean(sendToAll, false);
            notif.filters = filters;
            notif.repeatFrequency = sanitizedFrequency;
            notif.accentColor = accentColor || notif.accentColor;
            notif.previewText = previewText ? previewText.trim() : null;

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
