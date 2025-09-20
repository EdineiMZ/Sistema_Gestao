process.env.NODE_ENV = 'test';

const path = require('path');
const express = require('express');
const request = require('supertest');

let mockCurrentUser = {
    id: 1,
    role: 'client',
    active: true,
    name: 'Cliente Teste',
    email: 'cliente@example.com'
};

const createFlashStub = () => {
    const store = {};
    return (req, res, next) => {
        req.flash = jest.fn((type, message) => {
            if (message) {
                if (!store[type]) {
                    store[type] = [];
                }
                store[type].push(message);
                return store[type];
            }

            const messages = store[type] ? [...store[type]] : [];
            store[type] = [];
            return messages;
        });
        next();
    };
};

jest.mock('../../../src/middlewares/authMiddleware', () => jest.fn((req, res, next) => {
    req.user = { ...mockCurrentUser };
    next();
}));

jest.mock('../../../src/services/supportTicketService', () => ({
    listTicketsForUser: jest.fn(),
    getTicketById: jest.fn(),
    createTicket: jest.fn(),
    addMessage: jest.fn(),
    updateTicketStatus: jest.fn()
}));

const supportRoutes = require('../../../src/routes/supportRoutes');
const supportTicketService = require('../../../src/services/supportTicketService');

const buildApp = () => {
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '../../../src/views'));
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    app.use(createFlashStub());
    app.use('/support', supportRoutes);
    return app;
};

describe('Rotas de suporte - tickets', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        mockCurrentUser = {
            id: 1,
            role: 'client',
            active: true,
            name: 'Cliente Teste',
            email: 'cliente@example.com'
        };
        app = buildApp();
        supportTicketService.listTicketsForUser.mockResolvedValue([
            {
                id: 10,
                subject: 'Problema no acesso',
                status: 'pending',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                messages: [],
                creator: { id: 1, name: 'Cliente Teste', role: 'client' },
                assignee: null
            }
        ]);
        supportTicketService.getTicketById.mockResolvedValue({
            id: 10,
            subject: 'Problema no acesso',
            status: 'pending',
            creatorId: 1,
            assignedToId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [
                {
                    id: 1,
                    body: 'Mensagem inicial',
                    createdAt: new Date().toISOString(),
                    sender: { id: 1, name: 'Cliente Teste', role: 'client' },
                    attachments: []
                }
            ],
            attachments: [],
            attachmentCount: 0
        });
        supportTicketService.createTicket.mockResolvedValue({ ticket: { id: 10 } });
        supportTicketService.addMessage.mockResolvedValue({ ticket: { id: 10 } });
        supportTicketService.updateTicketStatus.mockResolvedValue({ id: 10 });
    });

    it('renderiza a lista de tickets do usuário autenticado', async () => {
        const response = await request(app).get('/support/tickets');

        expect(response.status).toBe(200);
        expect(response.text).toContain('Problema no acesso');
        expect(supportTicketService.listTicketsForUser).toHaveBeenCalledWith({
            user: expect.objectContaining({ id: 1 })
        });
    });

    it('permite criar um novo ticket e redireciona para a listagem', async () => {
        const response = await request(app)
            .post('/support/tickets')
            .send({ subject: 'Erro na fatura', description: '<p>Detalhes</p>' });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/support/tickets');
        expect(supportTicketService.createTicket).toHaveBeenCalledWith(expect.objectContaining({
            subject: 'Erro na fatura',
            description: '<p>Detalhes</p>',
            creator: expect.objectContaining({ id: 1 })
        }));
    });

    it('registra uma nova mensagem para o ticket', async () => {
        const response = await request(app)
            .post('/support/tickets/10/messages')
            .send({ body: 'Atualização importante' });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/support/tickets');
        expect(supportTicketService.addMessage).toHaveBeenCalledWith(expect.objectContaining({
            ticketId: 10,
            sender: expect.objectContaining({ id: 1 }),
            body: 'Atualização importante'
        }));
    });

    it('atualiza o status do ticket solicitado', async () => {
        mockCurrentUser = { ...mockCurrentUser, role: 'admin' };
        const response = await request(app)
            .post('/support/tickets/10/status')
            .send({ status: 'resolved' });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/support/tickets');
        expect(supportTicketService.updateTicketStatus).toHaveBeenCalledWith(expect.objectContaining({
            ticketId: 10,
            status: 'resolved',
            actor: expect.objectContaining({ id: 1 })
        }));
    });

    it('exibe os detalhes do ticket para o solicitante', async () => {
        const response = await request(app).get('/support/tickets/10');

        expect(response.status).toBe(200);
        expect(response.text).toContain('Chamado #10');
        expect(response.text).toContain('Problema no acesso');
        expect(supportTicketService.getTicketById).toHaveBeenCalledWith({ ticketId: '10' });
    });

    it('impede visualizar ticket sem permissão', async () => {
        supportTicketService.getTicketById.mockResolvedValueOnce({
            id: 99,
            subject: 'Outro chamado',
            status: 'pending',
            creatorId: 5,
            assignedToId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [],
            attachments: [],
            attachmentCount: 0
        });

        const response = await request(app).get('/support/tickets/99');

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/support/tickets');
    });
});
