'use strict';

const {
    sequelize,
    SupportTicket,
    SupportMessage,
    SupportAttachment,
    User,
    AuditLog
} = require('../../database/models');
const {
    TICKET_STATUSES,
    TICKET_STATUS_VALUES,
    isSupportAgentRole,
    sanitizeSupportContent
} = require('../constants/support');

const sanitizeSubject = (subject) => {
    if (subject === undefined || subject === null) {
        throw new Error('Assunto é obrigatório.');
    }

    const normalized = String(subject)
        .replace(/[\u0000-\u001F\u007F]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalized || normalized.length < 4) {
        throw new Error('Assunto deve ter ao menos 4 caracteres.');
    }

    return normalized.slice(0, 180);
};

const normalizeAttachmentsInput = (attachments) => {
    if (!attachments) {
        return [];
    }

    const entries = Array.isArray(attachments) ? attachments : [attachments];
    const normalized = [];
    const seen = new Set();

    for (const entry of entries) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }

        const storageKey = typeof entry.storageKey === 'string'
            ? entry.storageKey.trim()
            : String(entry.storageKey || '').trim();
        const fileName = typeof entry.fileName === 'string'
            ? entry.fileName.trim()
            : String(entry.fileName || '').trim();

        if (!storageKey || !fileName) {
            continue;
        }

        const fingerprint = `${storageKey}:${fileName}`;
        if (seen.has(fingerprint)) {
            continue;
        }
        seen.add(fingerprint);

        const record = {
            storageKey: storageKey.slice(0, 255),
            fileName: fileName.slice(0, 255),
            checksum: entry.checksum ? String(entry.checksum).slice(0, 128) : null,
            contentType: entry.contentType ? String(entry.contentType).slice(0, 120) : null,
            fileSize: null
        };

        if (entry.fileSize !== undefined && entry.fileSize !== null && entry.fileSize !== '') {
            const parsed = Number.parseInt(entry.fileSize, 10);
            if (Number.isFinite(parsed) && parsed >= 0) {
                record.fileSize = parsed;
            }
        }

        normalized.push(record);
    }

    return normalized;
};

const executeInTransaction = async (handler, externalTransaction = null) => {
    if (externalTransaction) {
        return handler(externalTransaction);
    }

    return sequelize.transaction(async (transaction) => handler(transaction));
};

const recordAudit = async ({ userId, action, resource, ip, transaction }) => {
    if (!AuditLog || typeof AuditLog.create !== 'function') {
        return null;
    }

    return AuditLog.create({
        userId: userId || null,
        action,
        resource,
        ip: ip || null
    }, { transaction });
};

const fetchTicketForUpdate = async (ticketId, transaction) => {
    const query = {
        transaction
    };

    if (transaction && transaction.LOCK && transaction.LOCK.UPDATE) {
        query.lock = transaction.LOCK.UPDATE;
    }

    const ticket = await SupportTicket.findByPk(ticketId, query);
    if (!ticket) {
        throw new Error('Chamado não encontrado.');
    }

    return ticket;
};

const ensureAgentUser = async (userId, transaction) => {
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
        throw new Error('Usuário não encontrado.');
    }

    if (!isSupportAgentRole(user.role)) {
        throw new Error('Usuário selecionado não possui perfil de atendimento.');
    }

    return user;
};

const mapTicketPayload = (ticketInstance) => {
    if (!ticketInstance) {
        return null;
    }

    const plain = typeof ticketInstance.get === 'function'
        ? ticketInstance.get({ plain: true })
        : ticketInstance;

    const attachments = Array.isArray(plain.attachments)
        ? plain.attachments.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        : [];

    const attachmentsByMessageId = attachments.reduce((accumulator, attachment) => {
        if (!attachment || !attachment.messageId) {
            return accumulator;
        }

        if (!accumulator.has(attachment.messageId)) {
            accumulator.set(attachment.messageId, []);
        }

        accumulator.get(attachment.messageId).push({
            id: attachment.id,
            fileName: attachment.fileName,
            fileSize: attachment.fileSize || null,
            createdAt: attachment.createdAt
        });

        return accumulator;
    }, new Map());

    const normalizedMessages = Array.isArray(plain.messages)
        ? plain.messages
            .slice()
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
            .map((message) => ({
                id: message.id,
                ticketId: message.ticketId,
                senderId: message.senderId,
                body: message.body,
                isFromAgent: Boolean(message.isFromAgent),
                isSystem: Boolean(message.isSystem),
                createdAt: message.createdAt,
                sender: message.sender
                    ? {
                        id: message.sender.id,
                        name: message.sender.name,
                        role: message.sender.role
                    }
                    : null,
                attachments: attachmentsByMessageId.get(message.id) || []
            }))
        : [];

    return {
        id: plain.id,
        subject: plain.subject,
        status: plain.status,
        creatorId: plain.creatorId,
        assignedToId: plain.assignedToId,
        createdAt: plain.createdAt,
        updatedAt: plain.updatedAt,
        lastMessageAt: plain.lastMessageAt,
        firstResponseAt: plain.firstResponseAt,
        resolvedAt: plain.resolvedAt,
        creator: plain.creator
            ? {
                id: plain.creator.id,
                name: plain.creator.name,
                email: plain.creator.email || null,
                role: plain.creator.role
            }
            : null,
        assignee: plain.assignee
            ? {
                id: plain.assignee.id,
                name: plain.assignee.name,
                email: plain.assignee.email || null,
                role: plain.assignee.role
            }
            : null,
        messages: normalizedMessages
    };
};

const listTicketsForUser = async ({ user, statusFilter = null }) => {
    if (!user || !user.id) {
        throw new Error('Usuário inválido.');
    }

    const where = {};

    if (!isSupportAgentRole(user.role)) {
        where.creatorId = user.id;
    } else if (statusFilter) {
        const normalizedStatuses = Array.isArray(statusFilter)
            ? statusFilter
                .map((status) => (typeof status === 'string' ? status.trim().toLowerCase() : null))
                .filter((status) => TICKET_STATUS_VALUES.includes(status))
            : typeof statusFilter === 'string'
                ? [statusFilter.trim().toLowerCase()]
                : [];

        if (normalizedStatuses.length) {
            where.status = normalizedStatuses;
        }
    }

    const tickets = await SupportTicket.findAll({
        where,
        include: [
            {
                model: User,
                as: 'creator',
                attributes: ['id', 'name', 'email', 'role']
            },
            {
                model: User,
                as: 'assignee',
                attributes: ['id', 'name', 'email', 'role']
            },
            {
                model: SupportMessage,
                as: 'messages',
                include: [
                    {
                        model: User,
                        as: 'sender',
                        attributes: ['id', 'name', 'role']
                    }
                ]
            },
            {
                model: SupportAttachment,
                as: 'attachments',
                attributes: ['id', 'messageId', 'fileName', 'fileSize', 'createdAt']
            }
        ],
        order: [
            ['lastMessageAt', 'DESC'],
            ['createdAt', 'DESC']
        ]
    });

    return tickets.map(mapTicketPayload).filter(Boolean);
};

const createTicket = async ({
    subject,
    description,
    creator,
    attachments = [],
    assignedToId = null,
    ipAddress = null,
    transaction = null
}) => {
    if (!creator || !creator.id) {
        throw new Error('Usuário criador inválido.');
    }

    const normalizedSubject = sanitizeSubject(subject);
    const sanitizedBody = sanitizeSupportContent(description);

    if (!sanitizedBody) {
        throw new Error('Descrição do chamado é obrigatória.');
    }

    return executeInTransaction(async (trx) => {
        let assigneeId = null;
        if (assignedToId) {
            const assignee = await ensureAgentUser(assignedToId, trx);
            assigneeId = assignee.id;
        }

        const ticket = await SupportTicket.create({
            subject: normalizedSubject,
            creatorId: creator.id,
            assignedToId: assigneeId,
            status: TICKET_STATUSES.PENDING,
            lastMessageAt: new Date()
        }, { transaction: trx });

        const isAgent = isSupportAgentRole(creator.role);
        const message = await SupportMessage.create({
            ticketId: ticket.id,
            senderId: creator.id,
            body: sanitizedBody,
            isFromAgent: isAgent
        }, { transaction: trx });

        const normalizedAttachments = normalizeAttachmentsInput(attachments).map((entry) => ({
            ...entry,
            ticketId: ticket.id,
            messageId: message.id,
            uploadedById: creator.id
        }));

        if (normalizedAttachments.length) {
            await SupportAttachment.bulkCreate(normalizedAttachments, { transaction: trx });
        }

        await ticket.update({
            lastMessageAt: message.createdAt || new Date()
        }, { transaction: trx });

        await recordAudit({
            userId: creator.id,
            action: 'support.ticket.create',
            resource: `support_ticket:${ticket.id}`,
            ip: ipAddress,
            transaction: trx
        });

        return { ticket, message };
    }, transaction);
};

const addMessage = async ({
    ticketId,
    sender,
    body,
    attachments = [],
    ipAddress = null,
    transaction = null
}) => {
    if (!sender || !sender.id) {
        throw new Error('Remetente inválido.');
    }

    const sanitizedBody = sanitizeSupportContent(body);
    if (!sanitizedBody) {
        throw new Error('Mensagem não pode estar vazia.');
    }

    return executeInTransaction(async (trx) => {
        const ticket = await fetchTicketForUpdate(ticketId, trx);

        const isAgent = isSupportAgentRole(sender.role);
        const isCreator = ticket.creatorId === sender.id;
        const isAssignedAgent = ticket.assignedToId && ticket.assignedToId === sender.id;

        if (!isCreator && !isAgent && !isAssignedAgent) {
            throw new Error('Você não possui permissão para responder este chamado.');
        }

        if (ticket.status === TICKET_STATUSES.RESOLVED && !isAgent) {
            throw new Error('Chamado resolvido não pode receber novas mensagens do solicitante.');
        }

        const message = await SupportMessage.create({
            ticketId: ticket.id,
            senderId: sender.id,
            body: sanitizedBody,
            isFromAgent: isAgent
        }, { transaction: trx });

        const normalizedAttachments = normalizeAttachmentsInput(attachments).map((entry) => ({
            ...entry,
            ticketId: ticket.id,
            messageId: message.id,
            uploadedById: sender.id
        }));

        if (normalizedAttachments.length) {
            await SupportAttachment.bulkCreate(normalizedAttachments, { transaction: trx });
        }

        const updatePayload = {
            lastMessageAt: message.createdAt || new Date()
        };

        if (isAgent && ticket.status === TICKET_STATUSES.PENDING) {
            updatePayload.status = TICKET_STATUSES.IN_PROGRESS;
            updatePayload.firstResponseAt = ticket.firstResponseAt || (message.createdAt || new Date());
        }

        if (!isAgent && ticket.status === TICKET_STATUSES.RESOLVED) {
            updatePayload.status = TICKET_STATUSES.IN_PROGRESS;
            updatePayload.resolvedAt = null;
        }

        if (isAgent && sanitizedBody && ticket.status !== TICKET_STATUSES.RESOLVED) {
            updatePayload.firstResponseAt = ticket.firstResponseAt || (message.createdAt || new Date());
        }

        await ticket.update(updatePayload, { transaction: trx });

        await recordAudit({
            userId: sender.id,
            action: 'support.ticket.message',
            resource: `support_ticket:${ticket.id}`,
            ip: ipAddress,
            transaction: trx
        });

        return { ticket, message };
    }, transaction);
};

const updateTicketStatus = async ({
    ticketId,
    status,
    actor,
    ipAddress = null,
    transaction = null
}) => {
    if (!actor || !actor.id) {
        throw new Error('Usuário inválido.');
    }

    const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : status;

    if (!TICKET_STATUS_VALUES.includes(normalizedStatus)) {
        throw new Error('Status informado é inválido.');
    }

    return executeInTransaction(async (trx) => {
        const ticket = await fetchTicketForUpdate(ticketId, trx);

        const isAgent = isSupportAgentRole(actor.role);
        const isCreator = ticket.creatorId === actor.id;

        if (!isAgent && !isCreator) {
            throw new Error('Você não possui permissão para alterar o status deste chamado.');
        }

    if (!isAgent) {
        const creatorAllowedStatuses = new Set([
            TICKET_STATUSES.PENDING,
            TICKET_STATUSES.RESOLVED
        ]);

        if (!creatorAllowedStatuses.has(normalizedStatus)) {
            throw new Error('Apenas a equipe de suporte pode alterar o status para este valor.');
        }
    }

        const updatePayload = { status: normalizedStatus };

        if (normalizedStatus === TICKET_STATUSES.RESOLVED) {
            updatePayload.resolvedAt = new Date();
        } else {
            updatePayload.resolvedAt = null;
        }

        await ticket.update(updatePayload, { transaction: trx });

        await recordAudit({
            userId: actor.id,
            action: 'support.ticket.status',
            resource: `support_ticket:${ticket.id}`,
            ip: ipAddress,
            transaction: trx
        });

        return ticket;
    }, transaction);
};

const assignTicket = async ({
    ticketId,
    assignedToId,
    actor,
    ipAddress = null,
    transaction = null
}) => {
    if (!actor || !actor.id) {
        throw new Error('Usuário inválido.');
    }

    if (!isSupportAgentRole(actor.role)) {
        throw new Error('Apenas atendentes podem atribuir chamados.');
    }

    return executeInTransaction(async (trx) => {
        const ticket = await fetchTicketForUpdate(ticketId, trx);

        let assigneeId = null;
        if (assignedToId) {
            const user = await ensureAgentUser(assignedToId, trx);
            assigneeId = user.id;
        }

        await ticket.update({ assignedToId: assigneeId }, { transaction: trx });

        await recordAudit({
            userId: actor.id,
            action: 'support.ticket.assign',
            resource: `support_ticket:${ticket.id}`,
            ip: ipAddress,
            transaction: trx
        });

        return ticket;
    }, transaction);
};

module.exports = {
    listTicketsForUser,
    createTicket,
    addMessage,
    updateTicketStatus,
    assignTicket,
    normalizeAttachmentsInput
};
