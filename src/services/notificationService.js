// src/services/notificationService.js
const {
    Notification,
    User,
    Appointment,
    Procedure,
    Room,
    UserNotificationPreference,
    sequelize
} = require('../../database/models');
const { sendEmail } = require('../utils/email');
const { buildEmailContent, buildRoleLabel } = require('../utils/placeholderUtils');
const { parseRole, sortRolesByHierarchy, USER_ROLES } = require('../constants/roles');
const { Op } = require('sequelize');

const ORGANIZATION_NAME = process.env.APP_NAME || 'Sistema de Gestão';
const DEFAULT_APPOINTMENT_WINDOW_MINUTES = 60;

const getCaseInsensitiveOperator = () => (sequelize.getDialect() === 'postgres' ? Op.iLike : Op.like);

const buildCaseInsensitiveMatch = (field, value, { exact = false } = {}) => {
    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    if (!normalizedValue) {
        return null;
    }

    const operator = getCaseInsensitiveOperator();
    const pattern = exact ? normalizedValue : `%${normalizedValue}%`;

    if (operator === Op.iLike) {
        return sequelize.where(sequelize.col(field), { [Op.iLike]: pattern });
    }

    return sequelize.where(
        sequelize.fn('lower', sequelize.col(field)),
        { [Op.like]: pattern.toLowerCase() }
    );
};

const userPreferenceInclude = {
    model: UserNotificationPreference,
    as: 'notificationPreference',
    attributes: ['emailEnabled', 'scheduledEnabled'],
    required: false
};

const isEmailOptInEnabled = (user) => user?.notificationPreference?.emailEnabled !== false;
const isScheduledOptInEnabled = (user) => user?.notificationPreference?.scheduledEnabled !== false;
const hasRequiredOptIn = (user, { requireScheduledOptIn = false } = {}) => (
    isEmailOptInEnabled(user) && (!requireScheduledOptIn || isScheduledOptInEnabled(user))
);

const computeNextTriggerDate = (currentDate, frequency) => {
    const base = currentDate ? new Date(currentDate) : new Date();
    if (Number.isNaN(base.getTime())) {
        return new Date(Date.now() + DEFAULT_APPOINTMENT_WINDOW_MINUTES * 60000);
    }

    switch (frequency) {
        case 'daily':
            base.setDate(base.getDate() + 1);
            break;
        case 'weekly':
            base.setDate(base.getDate() + 7);
            break;
        case 'monthly':
            base.setMonth(base.getMonth() + 1);
            break;
        default:
            base.setMinutes(base.getMinutes() + DEFAULT_APPOINTMENT_WINDOW_MINUTES);
    }

    return base;
};

const buildUserWhere = (filters = {}, options = {}) => {
    const where = {};
    const order = [];
    const andConditions = [];
    const likeOperator = getCaseInsensitiveOperator();

    if (filters.onlyActive !== false) {
        where.active = true;
    }

    if (Array.isArray(filters.targetRoles) && filters.targetRoles.length) {
        const roles = sortRolesByHierarchy(
            filters.targetRoles
                .map((role) => parseRole(role, null))
                .filter(Boolean)
        );

        if (roles.length) {
            where.role = { [Op.in]: roles };

            const caseClauses = roles
                .map((role, index) => `WHEN '${role}' THEN ${index}`)
                .join(' ');
            order.push([
                sequelize.literal(`CASE "User"."role" ${caseClauses} ELSE ${roles.length} END`),
                'ASC'
            ]);
            order.push(['name', 'ASC']);
        }
    }

    if (typeof filters.minimumCreditBalance === 'number') {
        where.creditBalance = { [Op.gte]: filters.minimumCreditBalance };
    }

    if (Array.isArray(filters.targetNames) && filters.targetNames.length) {
        const nameConditions = filters.targetNames
            .map((name) => buildCaseInsensitiveMatch('name', name))
            .filter(Boolean);
        if (nameConditions.length) {
            andConditions.push({ [Op.or]: nameConditions });
        }
    }

    if (Array.isArray(filters.targetEmails) && filters.targetEmails.length) {
        const emailConditions = filters.targetEmails
            .map((email) => buildCaseInsensitiveMatch('email', email, { exact: true }))
            .filter(Boolean);
        if (emailConditions.length) {
            andConditions.push({ [Op.or]: emailConditions });
        }
    }

    if (Array.isArray(filters.targetEmailFragments) && filters.targetEmailFragments.length) {
        const fragmentConditions = filters.targetEmailFragments
            .map((fragment) => buildCaseInsensitiveMatch('email', fragment))
            .filter(Boolean);
        if (fragmentConditions.length) {
            andConditions.push({ [Op.or]: fragmentConditions });
        }
    }

    if (filters.clientEmailDomain) {
        const domain = String(filters.clientEmailDomain).replace(/^@/, '').toLowerCase();
        if (domain) {
            const pattern = `%@${domain}`;
            if (likeOperator === Op.iLike) {
                andConditions.push(
                    sequelize.where(sequelize.col('email'), { [Op.iLike]: pattern })
                );
            } else {
                andConditions.push(
                    sequelize.where(
                        sequelize.fn('lower', sequelize.col('email')),
                        { [Op.like]: pattern.toLowerCase() }
                    )
                );
            }
        }
    }

    if (andConditions.length) {
        where[Op.and] = where[Op.and] ? [...where[Op.and], ...andConditions] : andConditions;
    }

    return { where, order };
};

const getNotificationFilters = (notification) => notification.filters || {};

const buildEmailPayload = (notification, user, appointment, extraContext = {}) => {
    const context = {
        user,
        appointment,
        extras: {
            organizationName: ORGANIZATION_NAME,
            fallbackName: user?.name,
            professionalName: appointment?.professional?.name,
            procedureName: appointment?.procedure?.name,
            roomName: appointment?.room?.name,
            userRoleLabel: buildRoleLabel(user?.role),
            ...extraContext
        }
    };

    const content = buildEmailContent(notification, context);
    return {
        subject: content.subject,
        options: {
            text: content.text,
            html: content.html,
            headers: content.previewText
                ? { 'X-Entity-Preview': content.previewText }
                : undefined
        }
    };
};

let messageHtmlWarningIssued = false;

const ensureMessageHtmlColumnExists = async () => {
    const queryInterface = sequelize.getQueryInterface();
    const columns = await queryInterface.describeTable('Notifications');
    const hasMessageHtml = Boolean(columns?.messageHtml);

    if (!hasMessageHtml) {
        if (!messageHtmlWarningIssued) {
            console.warn(
                'Aviso: coluna "messageHtml" ausente na tabela "Notifications". ' +
                'Processamento de notificações interrompido até que a migração seja aplicada.'
            );
            messageHtmlWarningIssued = true;
        }
        return false;
    }

    if (messageHtmlWarningIssued) {
        messageHtmlWarningIssued = false;
    }

    return true;
};

/**
 * Processa todas as notificações ativas (não enviadas) que estão agendadas para disparo.
 */
async function processNotifications() {
    try {
        const now = new Date();

        const hasMessageHtmlColumn = await ensureMessageHtmlColumnExists();
        if (!hasMessageHtmlColumn) {
            return;
        }

        // Busca notificações ativas, não enviadas, com triggerDate nulo ou menor ou igual a agora.
        const notifications = await Notification.findAll({
            where: {
                active: true,
                [Op.or]: [
                    { sent: false },
                    { repeatFrequency: { [Op.ne]: 'none' } }
                ],
                [Op.or]: [
                    { triggerDate: null },
                    { triggerDate: { [Op.lte]: now } }
                ]
            }
        });

        for (const notif of notifications) {
            try {
                if (notif.type === 'birthday') {
                    await processBirthdayNotification(notif);
                } else if (notif.type === 'appointment') {
                    await processAppointmentNotification(notif);
                } else {
                    await processCustomNotification(notif);
                }

                if (notif.repeatFrequency && notif.repeatFrequency !== 'none') {
                    const nextTrigger = computeNextTriggerDate(notif.triggerDate || now, notif.repeatFrequency);
                    await notif.update({ triggerDate: nextTrigger, sent: false });
                } else {
                    await notif.update({ sent: true });
                }
            } catch (notificationError) {
                console.error(`Erro ao processar notificação ${notif.id}:`, notificationError);
            }
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
    const filters = getNotificationFilters(notif);
    const { where, order } = buildUserWhere(filters);
    const today = new Date().toISOString().slice(5, 10);

    const dialect = sequelize.getDialect();
    const birthdayExpression = dialect === 'postgres'
        ? sequelize.fn('to_char', sequelize.col('dateOfBirth'), 'MM-DD')
        : sequelize.fn('strftime', '%m-%d', sequelize.col('dateOfBirth'));

    const andConditions = where[Op.and] ? [...where[Op.and]] : [];
    andConditions.push(sequelize.where(birthdayExpression, today));
    where[Op.and] = andConditions;

    const users = await User.findAll({
        where,
        include: [userPreferenceInclude]
    });


    for (const user of users) {
        if (!user.email || !hasRequiredOptIn(user)) continue;
        const payload = buildEmailPayload(notif, user, null);
        await sendEmail(user.email, payload.subject, payload.options);
    }
}

/**
 * Processa notificações do tipo 'appointment'
 * Exemplo: envia lembrete para agendamentos que começam em até 1 hora.
 */
async function processAppointmentNotification(notif) {
    const filters = getNotificationFilters(notif);
    const minutesWindow = Number.parseInt(filters.timeWindowMinutes, 10);
    const windowMinutes = Number.isInteger(minutesWindow) && minutesWindow > 0
        ? minutesWindow
        : DEFAULT_APPOINTMENT_WINDOW_MINUTES;

    const now = new Date();
    const defaultEnd = new Date(now.getTime() + windowMinutes * 60000);

    let startWindow = filters.dateRangeStart ? new Date(filters.dateRangeStart) : now;
    if (Number.isNaN(startWindow.getTime()) || startWindow < now) {
        startWindow = now;
    }

    let endWindow = filters.dateRangeEnd ? new Date(filters.dateRangeEnd) : defaultEnd;
    if (Number.isNaN(endWindow.getTime())) {
        endWindow = defaultEnd;
    } else if (!filters.dateRangeEnd) {
        endWindow = defaultEnd;
    } else {
        endWindow.setHours(23, 59, 59, 999);
    }

    const where = {
        start: { [Op.between]: [startWindow, endWindow] },
        status: filters.appointmentStatus?.length
            ? { [Op.in]: filters.appointmentStatus }
            : 'scheduled'
    };

    if (filters.procedureId) {
        where.procedureId = filters.procedureId;
    }

    if (filters.roomId) {
        where.roomId = filters.roomId;
    }

    if (filters.clientEmailDomain) {
        const domain = String(filters.clientEmailDomain).replace(/^@/, '').toLowerCase();
        where[Op.and] = where[Op.and] || [];
        where[Op.and].push(
            sequelize.where(
                sequelize.fn('lower', sequelize.col('Appointment.clientEmail')),
                { [Op.like]: `%@${domain}` }
            )
        );
    }

    const appointments = await Appointment.findAll({
        where,
        include: [
            {
                model: User,
                as: 'professional',
                include: [userPreferenceInclude]
            },
            { model: Procedure, as: 'procedure' },
            { model: Room, as: 'room' }
        ]
    });

    for (const appointment of appointments) {
        const professional = appointment.professional;

        if (filters.includeClient !== false && appointment.clientEmail) {
            const pseudoUser = {
                name: appointment.clientEmail.split('@')[0],
                email: appointment.clientEmail,
                role: USER_ROLES.CLIENT
            };
            const payload = buildEmailPayload(notif, pseudoUser, appointment, {
                fallbackName: pseudoUser.name
            });
            await sendEmail(appointment.clientEmail, payload.subject, payload.options);
        }

        if (filters.includeProfessional !== false && professional?.email) {
            if (filters.onlyActive !== false && professional.active === false) {
                continue;
            }
            if (!hasRequiredOptIn(professional, { requireScheduledOptIn: true })) {
                continue;
            }
            const payload = buildEmailPayload(notif, professional, appointment);
            await sendEmail(professional.email, payload.subject, payload.options);
        }
    }
}

/**
 * Processa notificações customizadas.
 * Se sendToAll for verdadeiro, envia para todos os usuários ativos;
 * caso contrário, envia para o usuário específico definido em notif.userId.
 */
async function processCustomNotification(notif) {
    const filters = getNotificationFilters(notif);
    const preferenceOptions = {
        requireScheduledOptIn: Boolean(filters.requireScheduledOptIn)
    };
    const recipients = new Map();

    const enqueueUser = (user) => {
        if (user && user.email && hasRequiredOptIn(user, preferenceOptions)) {
            recipients.set(user.email, user);
        }
    };

    const hasAdvancedFilters = Object.keys(filters).some((key) => !['onlyActive', 'includeProfessional', 'includeClient'].includes(key));

    if (notif.sendToAll || hasAdvancedFilters) {
        const { where, order } = buildUserWhere(filters, preferenceOptions);
        const queryOptions = {
            where,
            include: [userPreferenceInclude]
        };
        if (order?.length) {
            queryOptions.order = order;
        }
        const users = await User.findAll(queryOptions);
        users.forEach(enqueueUser);
    }

    if (notif.userId) {
        const specificUser = await User.findByPk(notif.userId, {
            include: [userPreferenceInclude]
        });
        if (specificUser) {
            if (filters.onlyActive !== false && specificUser.active === false) {
                // skip inactive users when filtro exige ativos
                if (!notif.sendToAll && !hasAdvancedFilters) {
                    return;
                }
            } else {
                enqueueUser(specificUser);
            }
        }
    }

    for (const user of recipients.values()) {
        if (filters.onlyActive !== false && user.active === false) {
            continue;
        }
        if (!hasRequiredOptIn(user, preferenceOptions)) {
            continue;
        }
        const payload = buildEmailPayload(notif, user, null);
        await sendEmail(user.email, payload.subject, payload.options);
    }
}

module.exports = {
    processNotifications,
    buildUserWhere,
    _internal: {
        buildUserWhere,
        processAppointmentNotification,
        processBirthdayNotification,
        processCustomNotification,
        hasRequiredOptIn
    }

};
