process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

jest.mock('../../database/models', () => {
    const { Op } = require('sequelize');

    return {
        FinanceEntry: {
            findAll: jest.fn()
        },
        Notification: {
            findAll: jest.fn()
        },
        User: {},
        Procedure: {},
        Room: {},
        Sequelize: { Op },
        sequelize: {}
    };
});

const request = require('supertest');
const { FinanceEntry, Notification } = require('../../database/models');
const { createRouterTestApp } = require('../utils/createRouterTestApp');
const { authenticateTestUser } = require('../utils/authTestUtils');

const authRoutes = require('../../src/routes/authRoutes');
const dashboardRoutes = require('../../src/routes/dashboardRoutes');
const financeRoutes = require('../../src/routes/financeRoutes');
const notificationRoutes = require('../../src/routes/notificationRoutes');

describe('Smoke tests das rotas principais', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        app = createRouterTestApp({
            routes: [
                ['/', authRoutes],
                ['/dashboard', dashboardRoutes],
                ['/finance', financeRoutes],
                ['/notifications', notificationRoutes]
            ]
        });
    });

    it('retorna a landing page com elementos principais', async () => {
        const response = await request(app).get('/');

        expect(response.status).toBe(200);
        expect(response.text).toContain('Transforme sua gestão');
        expect(response.text).toContain('Inteligência operacional');
    });

    it('renderiza o dashboard para administradores autenticados', async () => {
        const { agent } = await authenticateTestUser(app);

        const response = await agent.get('/dashboard');

        expect(response.status).toBe(200);
        expect(response.text).toContain('Visão gerencial inteligente');
        expect(response.text).toContain('Próximos atendimentos');
    });

    it('lista lançamentos financeiros com sucesso', async () => {
        FinanceEntry.findAll.mockResolvedValue([
            {
                id: 1,
                description: 'Mensalidade corporativa',
                type: 'receivable',
                value: '1500.00',
                dueDate: '2024-05-10',
                paymentDate: '2024-05-11',
                status: 'paid',
                recurring: true,
                recurringInterval: 'monthly'
            }
        ]);

        const { agent } = await authenticateTestUser(app);
        const response = await agent.get('/finance');

        expect(FinanceEntry.findAll).toHaveBeenCalledTimes(1);
        expect(response.status).toBe(200);
        expect(response.text).toContain('Gerenciar finanças estratégicas');
        expect(response.text).toContain('Lançamentos recentes');
        expect(response.text).toContain('Mensalidade corporativa');
    });

    it('exibe campanhas de notificações disponíveis', async () => {
        Notification.findAll.mockResolvedValue([
            {
                get: () => ({
                    id: 7,
                    title: 'Boas-vindas',
                    message: 'Seja bem-vindo ao novo ciclo!',
                    repeatFrequency: 'daily',
                    filters: { onlyActive: true },
                    sendToAll: true,
                    triggerDate: null,
                    userId: null
                })
            }
        ]);

        const { agent } = await authenticateTestUser(app);
        const response = await agent.get('/notifications');

        expect(Notification.findAll).toHaveBeenCalledTimes(1);
        expect(response.status).toBe(200);
        expect(response.text).toContain('Campanhas e notificações');
        expect(response.text).toContain('Boas-vindas');
    });
});
