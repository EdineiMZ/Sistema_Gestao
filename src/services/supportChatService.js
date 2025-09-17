const sanitizeHtml = require('sanitize-html');
const {
    SupportTicket,
    SupportMessage,
    SupportAttachment,
    Notification,
    User
} = require('../../database/models');
const { USER_ROLES, getRoleLevel } = require('../constants/roles');
const { isSupportAgentRole } = require('../constants/support');
const fileStorageService = require('./fileStorageService');
const notificationService = require('./notificationService');

const ALLOWED_MIME_TYPES = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'application/pdf'
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ROOM_PREFIX = 'support:ticket:';

let ioInstance = null;

const getRoomName = (ticketId) => `${ROOM_PREFIX}${ticketId}`;

const sanitizeMessageContent = (value) => {
    if (!value) {
        return '';
    }

    return sanitizeHtml(String(value), {
        allowedTags: [],
        allowedAttributes: {},
        textFilter: (text) => text.trim()
    }).slice(0, 2000);
};

const normalizeUserFromSession = (session = {}) => {
    if (!session || typeof session !== 'object') {
        return null;
    }

    const user = session.user || session;

    if (!user || !user.id || !user.active) {
        return null;
    }

    return {
        id: user.id,
        name: user.name,
        email: user.email || null,
        role: user.role,
        active: user.active
    };
};

const ensureSessionUser = (socket) => {
    const session = socket?.request?.session;
    const user = normalizeUserFromSession(session);

    if (!user) {
        const error = new Error('UNAUTHORIZED');
        error.status = 401;
        throw error;
    }

    return user;
};

const ensureTicketAccess = async (ticketId, user) => {
    if (!ticketId) {
        const error = new Error('INVALID_TICKET');
        error.status = 400;
        throw error;
    }

    const ticket = await SupportTicket.findByPk(ticketId);

    if (!ticket) {
        const error = new Error('TICKET_NOT_FOUND');
        error.status = 404;
        throw error;
    }

    const isOwner = ticket.creatorId === user.id;
    const isAdmin = getRoleLevel(user.role) >= getRoleLevel(USER_ROLES.ADMIN);

    if (!isOwner && !isAdmin) {
        const error = new Error('FORBIDDEN');
        error.status = 403;
        throw error;
    }

    return { ticket, isOwner, isAdmin };
};

const ensureAdminRole = (user) => {
    if (getRoleLevel(user.role) < getRoleLevel(USER_ROLES.ADMIN)) {
        const error = new Error('ADMIN_REQUIRED');
        error.status = 403;
        throw error;
    }
};

const mapMessageToPayload = (message) => {
    if (!message) {
        return null;
    }

    const plain = typeof message.get === 'function'
        ? message.get({ plain: true })
        : message;

    const attachment = plain.attachment
        ? {
            id: plain.attachment.id,
            originalName: plain.attachment.originalName,
            mimeType: plain.attachment.mimeType,
            size: plain.attachment.size
        }
        : null;

    const sender = plain.sender
        ? {
            id: plain.sender.id,
            name: plain.sender.name,
            role: plain.sender.role
        }
        : null;

    return {
        id: plain.id,
        ticketId: plain.ticketId,
        senderId: plain.senderId,
        body: plain.body || '',
        isFromAgent: Boolean(plain.isFromAgent),
        isSystem: Boolean(plain.isSystem),
        attachment,
        sender,
        createdAt: plain.createdAt
    };
};

const loadTicketHistory = async (ticketId) => {
    const messages = await SupportMessage.findAll({
        where: { ticketId },
        include: [
            {
                model: SupportAttachment,
                as: 'attachment',
                required: false
            },
            {
                model: User,
                as: 'sender',
                required: false,
                attributes: ['id', 'name', 'role']
            }
        ],
        order: [['createdAt', 'ASC']]
    });

    return messages.map(mapMessageToPayload).filter(Boolean);
};

const listTicketAttachments = async (ticketId) => {
    const attachments = await SupportAttachment.findAll({
        where: { ticketId },
        order: [['createdAt', 'ASC']],
        attributes: ['id', 'ticketId', 'originalName', 'mimeType', 'size', 'createdAt']
    });

    return attachments.map((attachment) => attachment.get({ plain: true }));
};

const persistMessage = async ({
    ticketId,
    senderId,
    body = '',
    isFromAgent = false,
    isSystem = false,
    attachmentId = null,
    transaction
}) => {
    const payload = {
        ticketId,
        senderId,
        body: sanitizeMessageContent(body),
        isFromAgent: Boolean(isFromAgent),
        isSystem: Boolean(isSystem),
        attachmentId: attachmentId || null
    };

    if (!payload.body && !payload.attachmentId && !payload.isSystem) {
        throw new Error('Mensagem não pode estar vazia.');
    }

    const created = await SupportMessage.create(payload, { transaction });

    if (!created) {
        throw new Error('FAILED_TO_PERSIST_MESSAGE');
    }

    const message = await SupportMessage.findByPk(created.id, {
        include: [
            {
                model: SupportAttachment,
                as: 'attachment',
                required: false
            },
            {
                model: User,
                as: 'sender',
                required: false,
                attributes: ['id', 'name', 'role']
            }
        ],
        transaction
    });

    return mapMessageToPayload(message);
};

const validateAttachmentInput = (file) => {
    if (!file || !file.buffer) {
        const error = new Error('INVALID_ATTACHMENT');
        error.status = 400;
        throw error;
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        const error = new Error('UNSUPPORTED_FILE_TYPE');
        error.status = 415;
        throw error;
    }

    if (file.size > MAX_FILE_SIZE) {
        const error = new Error('FILE_TOO_LARGE');
        error.status = 413;
        throw error;
    }
};

const createAttachment = async ({ ticketId, file }) => {
    validateAttachmentInput(file);

    const stored = await fileStorageService.saveBuffer({
        buffer: file.buffer,
        originalName: file.originalname
    });

    const attachment = await SupportAttachment.create({
        ticketId,
        originalName: stored.sanitizedFileName,
        storageKey: stored.storageKey,
        mimeType: file.mimetype,
        size: file.size,
        checksum: stored.checksum
    });

    return {
        id: attachment.id,
        ticketId: attachment.ticketId,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        size: attachment.size
    };
};

const getAttachmentById = async (attachmentId) => {
    if (!attachmentId) {
        return null;
    }

    const attachment = await SupportAttachment.findByPk(attachmentId);
    return attachment || null;
};

const notifyAdminJoined = async ({ ticket, adminUser }) => {
    if (!ticket || !adminUser) {
        return;
    }

    const systemContent = `Administrador ${adminUser.name || adminUser.email || 'Admin'} entrou no chat.`;
    let systemMessage = null;

    try {
        systemMessage = await persistMessage({
            ticketId: ticket.id,
            senderId: adminUser.id,
            body: systemContent,
            isFromAgent: true,
            isSystem: true
        });

        if (ioInstance) {
            ioInstance.to(getRoomName(ticket.id)).emit('support:message', systemMessage);
        }
    } catch (error) {
        console.error('Falha ao registrar mensagem de entrada do admin:', error);
    }

    try {
        await Notification.create({
            title: 'Atendimento em andamento',
            message: `Um administrador entrou no chat do ticket #${ticket.id}.`,
            type: 'support',
            triggerDate: new Date(),
            active: true,
            repeatFrequency: 'none',
            status: 'scheduled',
            userId: ticket.creatorId,
            sendToAll: false,
            sent: false
        });

        await notificationService.processNotifications();
    } catch (error) {
        console.error('Falha ao acionar notificações do chat de suporte:', error);
    }
};

const initializeSupportChat = ({ io, sessionMiddleware }) => {
    if (!io) {
        throw new Error('Socket.io instance é obrigatório.');
    }

    if (!sessionMiddleware || typeof sessionMiddleware !== 'function') {
        throw new Error('Session middleware é obrigatório para autenticar sockets.');
    }

    io.use((socket, next) => sessionMiddleware(socket.request, {}, next));

    io.use((socket, next) => {
        try {
            const user = ensureSessionUser(socket);
            socket.data.user = user;
            return next();
        } catch (error) {
            return next(error);
        }
    });

    io.on('connection', (socket) => {
        const joinedTickets = new Set();

        socket.on('support:join', async ({ ticketId, asAdmin }, ack = () => {}) => {
            try {
                const user = socket.data.user;
                const { ticket, isAdmin } = await ensureTicketAccess(ticketId, user);

                if (asAdmin) {
                    ensureAdminRole(user);
                }

                const roomName = getRoomName(ticketId);
                socket.join(roomName);
                joinedTickets.add(ticketId);

                const history = await loadTicketHistory(ticketId);

                ack({ ok: true, history });

                if (asAdmin && isAdmin && io) {
                    io.to(roomName).emit('support:agent:online', {
                        ticketId,
                        agentId: user.id,
                        agentName: user.name
                    });
                }
            } catch (error) {
                ack({ ok: false, error: error.message || 'JOIN_FAILED' });
            }
        });

        socket.on('support:message', async (payload, ack = () => {}) => {
            try {
                const user = socket.data.user;
                const { ticketId, body, attachmentId } = payload || {};

                if (!joinedTickets.has(ticketId)) {
                    throw new Error('NOT_IN_ROOM');
                }

                const { ticket } = await ensureTicketAccess(ticketId, user);

                let finalAttachmentId = null;
                if (attachmentId) {
                    const attachment = await SupportAttachment.findOne({
                        where: {
                            id: attachmentId,
                            ticketId
                        }
                    });

                    if (!attachment) {
                        throw new Error('ATTACHMENT_NOT_FOUND');
                    }

                    finalAttachmentId = attachment.id;
                }

                const persisted = await persistMessage({
                    ticketId,
                    senderId: user.id,
                    body: body || '',
                    isFromAgent: isSupportAgentRole(user.role),
                    isSystem: false,
                    attachmentId: finalAttachmentId
                });

                io.to(getRoomName(ticketId)).emit('support:message', persisted);

                ack({ ok: true, message: persisted });
            } catch (error) {
                ack({ ok: false, error: error.message || 'SEND_FAILED' });
            }
        });
    });

    ioInstance = io;
};

const getIo = () => ioInstance;

module.exports = {
    initializeSupportChat,
    ensureSessionUser,
    ensureTicketAccess,
    ensureAdminRole,
    createAttachment,
    getAttachmentById,
    loadTicketHistory,
    listTicketAttachments,
    persistMessage,
    notifyAdminJoined,
    getIo,
    constants: {
        MAX_FILE_SIZE,
        ALLOWED_MIME_TYPES
    }
};
