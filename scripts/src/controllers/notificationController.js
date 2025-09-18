// src/controllers/notificationController.js
const sanitizeHtml = require('sanitize-html');

const { Op } = require('sequelize');
const { Notification, User, Procedure, Room } = require('../../database/models');
const { buildQueryFilters } = require('../utils/queryBuilder');
const { ROLE_LABELS, parseRole, sortRolesByHierarchy } = require('../constants/roles');


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

const parseStringArray = (value) => {
    if (!value) return [];
    const source = Array.isArray(value) ? value : [value];
    return source
        .flatMap((item) => String(item).split(/[\n;,]+/))
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0);
};

const parseRoleArray = (value) => {
    if (!value) return [];
    const source = Array.isArray(value) ? value : [value];
    return sortRolesByHierarchy(
        source
            .flatMap((item) => String(item).split(/[\n;,]+/))
            .map((item) => parseRole(item, null))
            .filter(Boolean)
    );
};

const DANGEROUS_CHARS_REGEX = /[<>"'`$\\]/g;
const NAME_DISALLOWED_REGEX = /[^\p{L}\p{M} .'-]/gu;
const EMAIL_DISALLOWED_REGEX = /[^a-z0-9@._+-]/gi;

const normalizeEntries = (value) => {
    if (value === undefined || value === null) {
        return [];
    }

    const source = Array.isArray(value) ? value : [value];
    return source
        .flatMap((entry) => {
            if (entry === undefined || entry === null) {
                return [];
            }
            if (Array.isArray(entry)) {
                return entry;
            }
            return String(entry).split(/[\n;,]+/);
        })
        .map((entry) => String(entry).trim())
        .filter((entry) => entry.length > 0);
};

const DANGEROUS_NAME_KEYWORDS = /\b(?:script|alert|onerror|onload|iframe)\b/gi;

const sanitizeNameEntries = (value) => {
    const entries = normalizeEntries(value);
    const result = [];
    const seen = new Set();

    for (const raw of entries) {
        let normalized = raw
            .replace(/<[^>]*>/g, ' ')
            .replace(/[\u0000-\u001F\u007F]+/g, ' ')
            .replace(DANGEROUS_CHARS_REGEX, '')
            .replace(DANGEROUS_NAME_KEYWORDS, ' ')
            .replace(NAME_DISALLOWED_REGEX, '')
            .replace(/\s{2,}/g, ' ')
            .trim();

        if (!normalized) continue;
        normalized = normalized.slice(0, 80);

        const fingerprint = normalized.toLocaleLowerCase('pt-BR');
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);

        result.push(normalized);
        if (result.length >= 25) break;
    }

    return result;
};

const sanitizeEmailEntries = (value, { allowPartial = false } = {}) => {
    const entries = normalizeEntries(value);
    const result = [];
    const seen = new Set();

    for (const raw of entries) {
        let normalized = raw
            .replace(/[\u0000-\u001F\u007F]+/g, '')
            .replace(DANGEROUS_CHARS_REGEX, '')
            .replace(EMAIL_DISALLOWED_REGEX, '')
            .toLowerCase();

        if (!allowPartial && normalized && !normalized.includes('@')) {
            continue;
        }

        if (!normalized) continue;
        normalized = normalized.slice(0, 120);

        const fingerprint = normalized;
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);

        result.push(normalized);
        if (result.length >= 40) break;
    }

    return result;
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
    const roles = parseRoleArray(body.targetRoles);
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
        const sanitizedDomain = String(body.clientEmailDomain)
            .trim()
            .replace(/^@/, '')
            .toLowerCase()
            .replace(/[^a-z0-9.-]/g, '');
        if (sanitizedDomain) {
            filters.clientEmailDomain = sanitizedDomain;
        }
    }

    const targetNames = [
        ...sanitizeNameEntries(body.targetNames),
        ...sanitizeNameEntries(body.userNames)
    ];
    if (targetNames.length) {
        const uniqueNames = [];
        const seen = new Set();
        for (const name of targetNames) {
            const fingerprint = name.toLocaleLowerCase('pt-BR');
            if (seen.has(fingerprint)) continue;
            seen.add(fingerprint);
            uniqueNames.push(name);
            if (uniqueNames.length >= 25) break;
        }
        if (uniqueNames.length) {
            filters.targetNames = uniqueNames;
        }
    }

    const targetEmails = [
        ...sanitizeEmailEntries(body.targetEmails, { allowPartial: false }),
        ...sanitizeEmailEntries(body.userEmails, { allowPartial: false })
    ];
    if (targetEmails.length) {
        const uniqueEmails = [];
        const seenEmails = new Set();
        for (const email of targetEmails) {
            if (seenEmails.has(email)) continue;
            seenEmails.add(email);
            uniqueEmails.push(email);
            if (uniqueEmails.length >= 40) break;
        }
        if (uniqueEmails.length) {
            filters.targetEmails = uniqueEmails;
        }
    }

    const partialEmails = [
        ...sanitizeEmailEntries(body.targetEmailFragments, { allowPartial: true }),
        ...sanitizeEmailEntries(body.partialEmails, { allowPartial: true })
    ];
    if (partialEmails.length) {
        const uniqueFragments = [];
        const seenFragments = new Set();
        for (const fragment of partialEmails) {
            if (seenFragments.has(fragment)) continue;
            seenFragments.add(fragment);
            uniqueFragments.push(fragment);
            if (uniqueFragments.length >= 60) break;
        }
        if (uniqueFragments.length) {
            filters.targetEmailFragments = uniqueFragments;
        }
    }

    filters.includeProfessional = parseBoolean(body.includeProfessional, true);
    filters.includeClient = parseBoolean(body.includeClient, true);

    return filters;
};

const formatFiltersForView = (filters = {}) => {
    if (!filters || Object.keys(filters).length === 0) {
        return ['Sem filtros adicionais'];
    }

    const summarizeList = (list, maxVisible = 3) => {
        if (!Array.isArray(list) || list.length === 0) {
            return null;
        }
        if (list.length <= maxVisible) {
            return list.join(', ');
        }
        return `${list.slice(0, maxVisible).join(', ')} (+${list.length - maxVisible})`;
    };

    const descriptions = [];
    if (filters.onlyActive) descriptions.push('Somente usuários ativos');
    if (filters.targetRoles?.length) {
        const labels = filters.targetRoles.map((role) => ROLE_LABELS[role] || role);
        descriptions.push(`Perfis: ${labels.join(', ')}`);
    }
    const summarizedNames = summarizeList(filters.targetNames);
    if (summarizedNames) descriptions.push(`Nomes-alvo: ${summarizedNames}`);
    const summarizedEmails = summarizeList(filters.targetEmails);
    if (summarizedEmails) descriptions.push(`E-mails específicos: ${summarizedEmails}`);
    const summarizedFragments = summarizeList(filters.targetEmailFragments);
    if (summarizedFragments) descriptions.push(`E-mails contendo: ${summarizedFragments}`);
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
    },
    buildFiltersFromRequest,
    formatFiltersForView
};

