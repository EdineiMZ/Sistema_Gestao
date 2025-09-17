process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const request = require('supertest');
const { USER_ROLES, getRoleLevel } = require('../../../src/constants/roles');

let mockCurrentUser = {
    id: 1,
    role: 'client',
    active: true,
    name: 'Cliente Teste',
    email: 'cliente@example.com'
};

jest.mock('../../../src/middlewares/authMiddleware', () => jest.fn((req, res, next) => {
    req.session = req.session || {};
    req.user = { ...mockCurrentUser };
    req.session.user = req.user;
    next();
}));

jest.mock('../../../src/middlewares/authorize', () => jest.fn(() => (req, res, next) => next()));

const supportRoutes = require('../../../src/routes/supportRoutes');
const { SupportTicket, SupportAttachment, User, sequelize } = require('../../../database/models');

const buildApp = () => {
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    app.use(session({
        secret: 'support-test-secret',
        resave: false,
        saveUninitialized: false
    }));
    app.use(flash());
    app.use((req, res, next) => {
        const sessionUser = req.session.user || null;
        res.locals.appName = 'Sistema de Gestão Inteligente';
        res.locals.pageTitle = 'Sistema de Gestão Inteligente';
        res.locals.user = sessionUser;
        res.locals.userRoleLevel = sessionUser ? getRoleLevel(sessionUser.role) : -1;
        res.locals.roles = USER_ROLES;
        res.locals.roleLabels = {};
        res.locals.roleOptions = [];
        res.locals.success_msg = null;
        res.locals.error_msg = null;
        res.locals.error = null;
        res.locals.notifications = [];
        res.locals.notificationError = null;
        res.locals.userMenuItems = [];
        res.locals.quickActions = [];
        next();
    });
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', '..', '..', 'src', 'views'));
    app.use('/support', supportRoutes);
    return app;
};

describe('Fluxo de suporte - integração', () => {
    let app;
    let requester;

    beforeEach(async () => {
        jest.clearAllMocks();
        await sequelize.sync({ force: true });
        requester = await User.create({
            name: 'Cliente Teste',
            email: 'cliente@example.com',
            password: 'senhaSegura123',
            role: 'client'
        });
        mockCurrentUser = {
            id: requester.id,
            role: 'client',
            active: true,
            name: requester.name,
            email: requester.email
        };
        app = buildApp();
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('permite criar tickets com anexos antes do atendimento iniciar', async () => {
        const pdfBuffer = Buffer.from('%PDF suporte teste');

        const response = await request(app)
            .post('/support/tickets')
            .field('subject', 'Erro ao gerar relatório gerencial')
            .field('description', 'O relatório de performance fica carregando indefinidamente.')
            .field('priority', 'high')
            .attach('attachments', pdfBuffer, {
                filename: 'relatorio.pdf',
                contentType: 'application/pdf'
            });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/support/tickets');

        const tickets = await SupportTicket.findAll({
            include: [{ model: SupportAttachment, as: 'attachments' }]
        });

        expect(tickets).toHaveLength(1);
        const [ticket] = tickets;
        expect(ticket.subject).toBe('Erro ao gerar relatório gerencial');
        expect(ticket.priority).toBe('high');
        expect(ticket.attachments).toHaveLength(1);
        const [attachment] = ticket.attachments;
        expect(attachment.fileName).toBe('relatorio.pdf');
        expect(attachment.mimeType).toBe('application/pdf');
        expect(Number(attachment.size)).toBe(pdfBuffer.length);
        expect(Buffer.isBuffer(attachment.data)).toBe(true);
    });

    it('lista apenas os chamados do usuário autenticado', async () => {
        const otherUser = await User.create({
            name: 'Gestor',
            email: 'gestor@example.com',
            password: 'senhaGestor123',
            role: 'manager'
        });

        await SupportTicket.create({
            userId: requester.id,
            subject: 'Painel não atualiza',
            description: 'As métricas ficam congeladas.',
            priority: 'medium'
        });

        await SupportTicket.create({
            userId: otherUser.id,
            subject: 'Configuração de alertas',
            description: 'Dúvida sobre alertas automáticos.',
            priority: 'low'
        });

        const response = await request(app).get('/support/tickets');

        expect(response.status).toBe(200);
        expect(response.text).toContain('Painel não atualiza');
        expect(response.text).not.toContain('Configuração de alertas');
    });

    it('exibe detalhes do chamado com anexos cadastrados', async () => {
        const ticket = await SupportTicket.create({
            userId: requester.id,
            subject: 'Integração ERP',
            description: 'Integração está retornando erro 500.',
            priority: 'medium'
        });

        await SupportAttachment.create({
            ticketId: ticket.id,
            fileName: 'log-erro.txt',
            mimeType: 'text/plain',
            size: 42,
            checksum: '123456',
            data: Buffer.from('Stacktrace simulada')
        });

        const response = await request(app).get(`/support/tickets/${ticket.id}`);

        expect(response.status).toBe(200);
        expect(response.text).toContain('Integração ERP');
        expect(response.text).toContain('log-erro.txt');
        expect(response.text).toContain('text/plain');
    });
});
