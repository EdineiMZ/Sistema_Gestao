process.env.NODE_ENV = 'test';

jest.mock('../../../database/models', () => {
    const messages = [];

    return {
        SupportTicket: {
            findByPk: jest.fn()
        },
        SupportMessage: {
            findAll: jest.fn(),
            create: jest.fn(async (payload) => {
                const entry = {
                    ...payload,
                    id: messages.length + 1,
                    createdAt: new Date()
                };
                messages.push(entry);
                return entry;
            }),
            findByPk: jest.fn(async (id) => {
                return messages.find((message) => message.id === id) || null;
            })
        },
        SupportAttachment: {
            create: jest.fn(async (payload) => ({
                ...payload,
                id: Date.now(),
                createdAt: new Date()
            })),
            findAll: jest.fn(),
            findOne: jest.fn(),
            findByPk: jest.fn()
        },
        Notification: {
            create: jest.fn(),
            findAll: jest.fn().mockResolvedValue([]),
            update: jest.fn()
        },
        sequelize: {
            transaction: async (fn) => fn(),
            getDialect: () => 'sqlite'
        }
    };
});

const express = require('express');
const session = require('express-session');
const http = require('http');
const request = require('supertest');
const { Server } = require('socket.io');
const Client = require('socket.io-client');

const supportChatService = require('../../../src/services/supportChatService');
const models = require('../../../database/models');

const TEST_TICKET = {
    id: 101,
    subject: 'Suporte estratégico',
    description: 'Precisamos de suporte avançado.',
    status: 'open',
    userId: 1,
    get() {
        return { ...this };
    }
};

describe('Support chat socket handshake', () => {
    let app;
    let server;
    let io;
    let port;
    let sessionMiddleware;

    const createClient = (cookies) => {
        return Client(`http://127.0.0.1:${port}`, {
            transports: ['websocket'],
            extraHeaders: {
                Cookie: cookies.map((cookie) => cookie.split(';')[0]).join('; ')
            }
        });
    };

    beforeEach(async () => {
        jest.clearAllMocks();

        models.SupportTicket.findByPk.mockResolvedValue(TEST_TICKET);
        models.SupportMessage.findAll.mockResolvedValue([
            {
                id: 1,
                ticketId: TEST_TICKET.id,
                senderId: TEST_TICKET.userId,
                senderRole: 'client',
                messageType: 'text',
                content: 'Mensagem inicial',
                attachment: null,
                createdAt: new Date()
            }
        ]);
        models.SupportAttachment.findAll.mockResolvedValue([]);
        models.SupportAttachment.findOne.mockResolvedValue(null);

        app = express();
        app.use(express.json());

        sessionMiddleware = session({
            secret: 'support-test',
            resave: false,
            saveUninitialized: false
        });

        app.use(sessionMiddleware);
        app.post('/login', (req, res) => {
            req.session.user = req.body;
            res.json({ ok: true });
        });

        server = http.createServer(app);
        io = new Server(server, { cors: false });
        supportChatService.initializeSupportChat({ io, sessionMiddleware });

        await new Promise((resolve) => {
            server.listen(() => {
                port = server.address().port;
                resolve();
            });
        });
    });

    afterEach(async () => {
        if (io) {
            io.close();
        }
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    it('permite que o solicitante do ticket realize o handshake e receba o histórico', async () => {
        const agent = request.agent(app);
        const loginResponse = await agent.post('/login').send({
            id: TEST_TICKET.userId,
            name: 'Cliente',
            role: 'client',
            active: true
        });

        const cookies = loginResponse.headers['set-cookie'];
        expect(cookies).toBeDefined();

        const client = createClient(cookies);

        await new Promise((resolve) => client.on('connect', resolve));
        const joinAck = await new Promise((resolve) => {
            client.emit('support:join', { ticketId: TEST_TICKET.id, asAdmin: false }, resolve);
        });

        expect(joinAck.ok).toBe(true);
        expect(Array.isArray(joinAck.history)).toBe(true);
        expect(models.SupportMessage.findAll).toHaveBeenCalledWith(
            expect.objectContaining({ where: { ticketId: TEST_TICKET.id } })
        );

        client.close();
    });

    it('bloqueia usuários sem perfil admin de ingressarem como atendentes', async () => {
        const agent = request.agent(app);
        const loginResponse = await agent.post('/login').send({
            id: TEST_TICKET.userId,
            name: 'Cliente',
            role: 'client',
            active: true
        });

        const cookies = loginResponse.headers['set-cookie'];
        const client = createClient(cookies);

        await new Promise((resolve) => client.on('connect', resolve));
        const joinAck = await new Promise((resolve) => {
            client.emit('support:join', { ticketId: TEST_TICKET.id, asAdmin: true }, resolve);
        });

        expect(joinAck.ok).toBe(false);
        expect(joinAck.error).toBe('ADMIN_REQUIRED');

        client.close();
    });

    it('registra mensagens ao enviar texto para o chat', async () => {
        const agent = request.agent(app);
        const loginResponse = await agent.post('/login').send({
            id: TEST_TICKET.userId,
            name: 'Cliente',
            role: 'client',
            active: true
        });

        const cookies = loginResponse.headers['set-cookie'];
        const client = createClient(cookies);

        await new Promise((resolve) => client.on('connect', resolve));
        await new Promise((resolve) => {
            client.emit('support:join', { ticketId: TEST_TICKET.id, asAdmin: false }, resolve);
        });

        const messageAck = await new Promise((resolve) => {
            client.emit('support:message', {
                ticketId: TEST_TICKET.id,
                content: 'Podem me ajudar?',
                messageType: 'text'
            }, resolve);
        });

        expect(messageAck.ok).toBe(true);
        expect(models.SupportMessage.create).toHaveBeenCalledWith(
            expect.objectContaining({
                ticketId: TEST_TICKET.id,
                senderRole: 'client',
                content: expect.any(String)
            }),
            { transaction: undefined }
        );

        client.close();
    });
});
