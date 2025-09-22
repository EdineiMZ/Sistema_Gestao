const EventEmitter = require('events');
const { USER_ROLES } = require('../../../src/constants/roles');

jest.mock('../../../database/models', () => {
    const SupportTicket = { findByPk: jest.fn() };
    const SupportMessage = {
        findAll: jest.fn(),
        create: jest.fn(),
        findByPk: jest.fn()
    };
    const SupportAttachment = {
        findAll: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        findByPk: jest.fn()
    };

    return {
        SupportTicket,
        SupportMessage,
        SupportAttachment,
        Notification: { create: jest.fn() },
        User: {}
    };
});

const models = require('../../../database/models');
const supportChatService = require('../../../src/services/supportChatService');

let lastPersistPayload = null;

const createFakeIo = () => {
    const middlewares = [];
    const emitter = new EventEmitter();

    const io = {
        use: jest.fn((middleware) => {
            middlewares.push(middleware);
        }),
        on: jest.fn((event, handler) => {
            emitter.on(event, handler);
        }),
        to: jest.fn(() => ({ emit: jest.fn() }))
    };

    const triggerConnection = async (socket) => {
        for (const middleware of middlewares) {
            await new Promise((resolve, reject) => {
                try {
                    middleware(socket, (error) => {
                        if (error) {
                            reject(error);
                            return;
                        }
                        resolve();
                    });
                } catch (error) {
                    reject(error);
                }
            });
        }

        emitter.emit('connection', socket);
    };

    return { io, triggerConnection };
};

const createFakeSocket = (sessionUser) => {
    const handlers = new Map();
    return {
        request: { session: { user: sessionUser } },
        data: {},
        on: jest.fn((event, handler) => {
            handlers.set(event, handler);
        }),
        join: jest.fn(),
        to: jest.fn(() => ({ emit: jest.fn() })),
        emit: jest.fn(),
        getHandler: (event) => handlers.get(event)
    };
};

describe('suporte - controle de acesso do chat em tempo real', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        lastPersistPayload = null;
        models.SupportMessage.findAll.mockResolvedValue([]);
        models.SupportAttachment.findAll.mockResolvedValue([]);
        models.SupportAttachment.findOne.mockResolvedValue(null);
        models.SupportMessage.create.mockImplementation(async (payload) => {
            lastPersistPayload = { ...payload };
            return { id: 4242 };
        });
        models.SupportMessage.findByPk.mockImplementation(async () => ({
            get: () => ({
                id: 4242,
                ticketId: lastPersistPayload?.ticketId,
                senderId: lastPersistPayload?.senderId,
                body: lastPersistPayload?.body,
                isFromAgent: lastPersistPayload?.isFromAgent,
                isSystem: lastPersistPayload?.isSystem,
                createdAt: new Date().toISOString(),
                attachment: lastPersistPayload?.attachmentId
                    ? {
                        id: lastPersistPayload.attachmentId,
                        originalName: 'arquivo.pdf',
                        mimeType: 'application/pdf',
                        size: 1024
                    }
                    : null,
                sender: {
                    id: lastPersistPayload?.senderId,
                    name: 'Tester',
                    role: USER_ROLES.COLLABORATOR
                }
            })
        }));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const buildSessionMiddleware = (user) => (req, _res, next) => {
        req.session = req.session || {};
        req.session.user = user;
        next();
    };

    const joinChat = async ({ user, ticket, asAdmin = false }) => {
        const { io, triggerConnection } = createFakeIo();
        supportChatService.initializeSupportChat({ io, sessionMiddleware: buildSessionMiddleware(user) });

        models.SupportTicket.findByPk.mockResolvedValue(ticket);

        const socket = createFakeSocket(user);
        await triggerConnection(socket);

        const joinHandler = socket.getHandler('support:join');
        expect(joinHandler).toBeInstanceOf(Function);

        const ackPayload = await new Promise((resolve) => {
            joinHandler({ ticketId: ticket.id, asAdmin }, (response) => resolve(response));
        });

        return { ackPayload, socket };
    };

    it('permite que um colaborador com papel de suporte abra o chat e envie mensagens como agente', async () => {
        const user = { id: 10, role: USER_ROLES.COLLABORATOR, active: true };
        const ticket = { id: 200, creatorId: 2, assignedToId: null };

        const { ackPayload, socket } = await joinChat({ user, ticket });

        expect(ackPayload.ok).toBe(true);
        expect(ackPayload.permissions.isAgent).toBe(true);

        const messageHandler = socket.getHandler('support:message');
        expect(messageHandler).toBeInstanceOf(Function);

        const ack = await new Promise((resolve) => {
            messageHandler({ ticketId: ticket.id, body: 'Olá' }, (response) => resolve(response));
        });

        expect(ack.ok).toBe(true);
        expect(models.SupportMessage.create).toHaveBeenCalledWith(
            expect.objectContaining({
                ticketId: ticket.id,
                senderId: user.id,
                isFromAgent: true
            }),
            expect.any(Object)
        );
    });

    it('permite que o responsável designado envie mensagens e anexos vinculados ao ticket', async () => {
        const user = { id: 33, role: USER_ROLES.CLIENT, active: true };
        const ticket = { id: 300, creatorId: 2, assignedToId: user.id };
        const attachment = { id: 99, ticketId: ticket.id };

        models.SupportAttachment.findOne.mockResolvedValue(attachment);

        const { ackPayload, socket } = await joinChat({ user, ticket });

        expect(ackPayload.ok).toBe(true);
        expect(ackPayload.permissions.isAssigned).toBe(true);

        const messageHandler = socket.getHandler('support:message');
        expect(messageHandler).toBeInstanceOf(Function);

        const ack = await new Promise((resolve) => {
            messageHandler({ ticketId: ticket.id, body: 'Arquivo enviado', attachmentId: attachment.id }, (response) => resolve(response));
        });

        expect(ack.ok).toBe(true);
        expect(models.SupportMessage.create).toHaveBeenCalledWith(
            expect.objectContaining({
                ticketId: ticket.id,
                senderId: user.id,
                isFromAgent: true,
                attachmentId: attachment.id
            }),
            expect.any(Object)
        );
    });
});
