// src/services/notificationService.js
const {
    Notification,
    NotificationDispatchLog,
    User,
    Appointment,
    Procedure,
    Room,
    UserNotificationPreference,
    sequelize
} = require('../../database/models');
const crypto = require('node:crypto');
const { sendEmail } = require('../utils/email');
const { buildEmailContent, buildRoleLabel } = require('../utils/placeholderUtils');
const { parseRole, sortRolesByHierarchy, USER_ROLES } = require('../constants/roles');
const { Op } = require('sequelize');

const ORGANIZATION_NAME = process.env.APP_NAME || 'Sistema de Gestão';
const DEFAULT_APPOINTMENT_WINDOW_MINUTES = 60;

const normalizeRecipient = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    return normalized || null;
};

const safeDateToISOString = (value) => {
    if (!value) {
        return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const safeTimestamp = (value) => {
    if (!value) {
        return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    const timestamp = date.getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
};

const stableStringify = (value) => {
    if (value === null || value === undefined) {
        return 'null';
    }

    if (typeof value === 'string') {
        return JSON.stringify(value);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return JSON.stringify(value);
    }

    if (typeof value === 'bigint') {
        return value.toString();
    }

    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
    }

    if (typeof value === 'object') {
        const keys = Object.keys(value).sort();
        const serialized = keys
            .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
            .join(',');
        return `{${serialized}}`;
    }

    return JSON.stringify(String(value));
};

const buildFingerprint = (value) => {
    try {
        return crypto.createHash('sha1').update(stableStringify(value ?? null)).digest('hex');
    } catch (error) {
        return crypto.createHash('sha1').update(String(value)).digest('hex');
    }
};

const buildCycleKey = (notification, now = new Date()) => {
    if (!notification) {
        return `unknown:${Date.now()}`;
    }

    const baseId = notification.id || 'unknown';
    const repeatFrequency = (notification.repeatFrequency || 'none').toLowerCase();
    const triggerTimestamp = safeTimestamp(notification.triggerDate);

    if (repeatFrequency === 'none') {
        if (triggerTimestamp) {
            return `single:${baseId}:${triggerTimestamp}`;
        }
        const reference = safeTimestamp(notification.updatedAt)
            ?? safeTimestamp(notification.createdAt)
            ?? safeTimestamp(now)
            ?? Date.now();
        return `single:${baseId}:immediate:${reference}`;
    }

    if (triggerTimestamp) {
        return `repeat:${baseId}:${repeatFrequency}:${triggerTimestamp}`;
    }

    const nowTimestamp = safeTimestamp(now) ?? Date.now();
    const bucket = Math.floor(nowTimestamp / 60000);
    return `repeat:${baseId}:${repeatFrequency}:bucket-${bucket}`;
};

const createDispatchTracker = async (notification, { now = new Date() } = {}) => {
    if (!notification || !notification.id) {
        return {
            cycleKey: buildCycleKey(notification, now),
            async dispatch(recipient, context, sendFn) {
                if (typeof sendFn !== 'function') {
                    return { skipped: true, reason: 'missing-handler' };
                }
                await sendFn({ normalizedRecipient: normalizeRecipient(recipient), contextPayload: context || {} });
                return { skipped: false };
            }
        };
    }

    const cycleKey = buildCycleKey(notification, now);
    const baseContext = {
        cycleKey,
        notificationId: notification.id,
        notificationType: notification.type || 'custom',
        repeatFrequency: notification.repeatFrequency || 'none',
        triggerDate: safeDateToISOString(notification.triggerDate),
        updatedAt: safeDateToISOString(notification.updatedAt),
        filtersFingerprint: buildFingerprint(notification.filters || {}),
        segmentFiltersFingerprint: buildFingerprint(notification.segmentFilters || {})
    };

    let existingLogs = [];
    try {
        existingLogs = await NotificationDispatchLog.findAll({
            where: {
                notificationId: notification.id,
                cycleKey
            },
            attributes: ['recipient', 'contextHash'],
            raw: true
        });
    } catch (error) {
        console.error('Erro ao carregar histórico de envios da notificação:', error);
        existingLogs = [];
    }

    const sentSet = new Set(existingLogs.map((entry) => `${entry.recipient}|${entry.contextHash}`));

    const dispatch = async (recipient, context, sendFn) => {
        const normalizedRecipient = normalizeRecipient(recipient);
        if (!normalizedRecipient) {
            return { skipped: true, reason: 'invalid-recipient' };
        }

        if (typeof sendFn !== 'function') {
            return { skipped: true, reason: 'missing-handler' };
        }

        const contextPayload = {
            ...baseContext,
            ...(context || {})
        };

        const contextHash = crypto.createHash('sha256')
            .update(stableStringify(contextPayload))
            .digest('hex');
        const dedupeKey = `${normalizedRecipient}|${contextHash}`;

        if (sentSet.has(dedupeKey)) {
            return { skipped: true, reason: 'duplicate' };
        }

        const result = await sendFn({ normalizedRecipient, contextPayload });

        try {
            await NotificationDispatchLog.create({
                notificationId: notification.id,
                recipient: normalizedRecipient,
                cycleKey,
                contextHash,
                context: contextPayload,
                sentAt: new Date()
            });
            sentSet.add(dedupeKey);
        } catch (error) {
            if (error?.name === 'SequelizeUniqueConstraintError') {
                sentSet.add(dedupeKey);
                console.warn(
                    `Envio duplicado detectado para notificação ${notification.id} e destinatário ${normalizedRecipient}. ` +
                    'Registro já existente.'
                );
            } else {
                throw error;
            }
        }

        return { skipped: false, result };
    };

    return { cycleKey, dispatch };
};

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
                const tracker = await createDispatchTracker(notif, { now });
                const runtimeContext = {
                    now,
                    tracker,
                    cycleKey: tracker.cycleKey,
                    currentTriggerDate: notif.triggerDate ? new Date(notif.triggerDate) : null
                };

                if (notif.type === 'birthday') {
                    await processBirthdayNotification(notif, runtimeContext);
                } else if (notif.type === 'appointment') {
                    await processAppointmentNotification(notif, runtimeContext);
                } else {
                    await processCustomNotification(notif, runtimeContext);
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
async function processBirthdayNotification(notif, runtimeContext = {}) {
    const now = runtimeContext.now instanceof Date ? runtimeContext.now : new Date();
    const tracker = runtimeContext.tracker || await createDispatchTracker(notif, { now });

    const filters = getNotificationFilters(notif);
    const { where, order } = buildUserWhere(filters);
    const today = now.toISOString().slice(5, 10);

    const dialect = sequelize.getDialect();
    const birthdayExpression = dialect === 'postgres'
        ? sequelize.fn('to_char', sequelize.col('dateOfBirth'), 'MM-DD')
        : sequelize.fn('strftime', '%m-%d', sequelize.col('dateOfBirth'));

    const andConditions = where[Op.and] ? [...where[Op.and]] : [];
    andConditions.push(sequelize.where(birthdayExpression, today));
    where[Op.and] = andConditions;

    const queryOptions = {
        where,
        include: [userPreferenceInclude]
    };

    if (order?.length) {
        queryOptions.order = order;
    }

    const users = await User.findAll(queryOptions);

    for (const user of users) {
        if (!user.email || !hasRequiredOptIn(user)) continue;

        const context = {
            contextType: 'birthday',
            userId: user.id ?? null,
            cycleDate: today
        };

        await tracker.dispatch(user.email, context, async () => {
            const payload = buildEmailPayload(notif, user, null);
            await sendEmail(user.email, payload.subject, payload.options);
        });
    }
}

/**
 * Processa notificações do tipo 'appointment'
 * Exemplo: envia lembrete para agendamentos que começam em até 1 hora.
 */
async function processAppointmentNotification(notif, runtimeContext = {}) {
    const now = runtimeContext.now instanceof Date ? runtimeContext.now : new Date();
    const tracker = runtimeContext.tracker || await createDispatchTracker(notif, { now });

    const filters = getNotificationFilters(notif);
    const minutesWindow = Number.parseInt(filters.timeWindowMinutes, 10);
    const windowMinutes = Number.isInteger(minutesWindow) && minutesWindow > 0
        ? minutesWindow
        : DEFAULT_APPOINTMENT_WINDOW_MINUTES;
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

            const context = {
                contextType: 'appointment',
                recipientRole: 'client',
                appointmentId: appointment.id ?? null,
                appointmentStart: safeDateToISOString(appointment.start),
                appointmentStatus: appointment.status || null
            };

            await tracker.dispatch(appointment.clientEmail, context, async () => {
                const payload = buildEmailPayload(notif, pseudoUser, appointment, {
                    fallbackName: pseudoUser.name
                });
                await sendEmail(appointment.clientEmail, payload.subject, payload.options);
            });
        }

        if (filters.includeProfessional !== false && professional?.email) {
            if (filters.onlyActive !== false && professional.active === false) {
                continue;
            }
            if (!hasRequiredOptIn(professional, { requireScheduledOptIn: true })) {
                continue;
            }

            const context = {
                contextType: 'appointment',
                recipientRole: 'professional',
                appointmentId: appointment.id ?? null,
                appointmentStart: safeDateToISOString(appointment.start),
                appointmentStatus: appointment.status || null,
                userId: professional.id ?? null
            };

            await tracker.dispatch(professional.email, context, async () => {
                const payload = buildEmailPayload(notif, professional, appointment);
                await sendEmail(professional.email, payload.subject, payload.options);
            });
        }
    }
}

/**
 * Processa notificações customizadas.
 * Se sendToAll for verdadeiro, envia para todos os usuários ativos;
 * caso contrário, envia para o usuário específico definido em notif.userId.
 */
async function processCustomNotification(notif, runtimeContext = {}) {
    const now = runtimeContext.now instanceof Date ? runtimeContext.now : new Date();
    const tracker = runtimeContext.tracker || await createDispatchTracker(notif, { now });

    const filters = getNotificationFilters(notif);
    const preferenceOptions = {
        requireScheduledOptIn: Boolean(filters.requireScheduledOptIn)
    };
    const recipients = new Map();

    const enqueueUser = (user) => {
        if (!user) {
            return;
        }

        const normalizedEmail = normalizeRecipient(user.email);
        if (!normalizedEmail) {
            return;
        }

        if (!hasRequiredOptIn(user, preferenceOptions)) {
            return;
        }

        if (recipients.has(normalizedEmail)) {
            return;
        }

        recipients.set(normalizedEmail, user);
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

    for (const [, user] of recipients) {
        if (filters.onlyActive !== false && user.active === false) {
            continue;
        }
        if (!hasRequiredOptIn(user, preferenceOptions)) {
            continue;
        }
        const context = {
            contextType: 'custom',
            recipientRole: user.role || null,
            userId: user.id ?? null,
            sendToAll: Boolean(notif.sendToAll)
        };

        await tracker.dispatch(user.email, context, async () => {
            const payload = buildEmailPayload(notif, user, null);
            await sendEmail(user.email, payload.subject, payload.options);
        });
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
