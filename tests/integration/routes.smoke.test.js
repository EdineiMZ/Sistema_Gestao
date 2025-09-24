process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

jest.mock('../../database/models', () => {
    const { Op } = require('sequelize');

    return {
        FinanceEntry: {
            findAll: jest.fn(),
            count: jest.fn()
        },
        FinanceGoal: {
            findAll: jest.fn()
        },
        Notification: {
            findAll: jest.fn()
        },
        User: {},
        Procedure: {},
        Room: {},
        Sequelize: {
            Op,
            col: jest.fn((value) => value),
            fn: jest.fn((fnName, ...args) => ({ fn: fnName, args })),
            literal: jest.fn((value) => value),
            cast: jest.fn((value) => value)
        },
        sequelize: {}
    };
});

const request = require('supertest');
const { FinanceEntry, FinanceGoal, Notification } = require('../../database/models');
const { createRouterTestApp } = require('../utils/createRouterTestApp');
const { authenticateTestUser } = require('../utils/authTestUtils');
const financeReportingService = require('../../src/services/financeReportingService');
const budgetService = require('../../src/services/budgetService');
const investmentSimulationService = require('../../src/services/investmentSimulationService');

const authRoutes = require('../../src/routes/authRoutes');
const dashboardRoutes = require('../../src/routes/dashboardRoutes');
const financeRoutes = require('../../src/routes/financeRoutes');
const notificationRoutes = require('../../src/routes/notificationRoutes');
const posRoutes = require('../../src/routes/posRoutes');
const { USER_ROLES } = require('../../src/constants/roles');

describe('Smoke tests das rotas principais', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        FinanceGoal.findAll.mockResolvedValue([]);
        FinanceEntry.count.mockResolvedValue(1);
        jest.spyOn(financeReportingService, 'getFinanceSummary').mockResolvedValue({
            totals: {
                receivable: 1500,
                payable: 500,
                net: 1000,
                overdue: 120,
                paid: 900,
                pending: 200
            },
            statusSummary: {
                receivable: { pending: 200, paid: 900, overdue: 120, cancelled: 0 },
                payable: { pending: 150, paid: 350, overdue: 0, cancelled: 0 }
            },
            monthlySummary: [
                { month: '2024-05', receivable: 1500, payable: 500 }
            ],
            projections: [],
            highlightProjection: null,
            projectionAlerts: [],
            periodLabel: 'maio de 2024'
        });
        jest.spyOn(budgetService, 'getBudgetOverview').mockResolvedValue({
            summaries: [
                {
                    id: 99,
                    month: '2024-05',
                    financeCategoryId: 5,
                    categoryName: 'Operacional',
                    categoryColor: '#2563eb',
                    monthlyLimit: 2000,
                    consumption: 800,
                    usage: 40,
                    status: 'healthy',
                    statusMeta: { key: 'healthy' }
                }
            ],
            categoryConsumption: [
                {
                    categoryId: 5,
                    categoryName: 'Operacional',
                    categoryColor: '#2563eb',
                    totalConsumption: 800,
                    totalLimit: 2000,
                    remaining: 1200,
                    averagePercentage: 40,
                    highestPercentage: 55,
                    months: 1,
                    statusMeta: { key: 'healthy', badgeClass: 'bg-success-subtle text-success', barColor: '#10b981', label: 'Saudável' }
                }
            ],
            months: ['2024-05']
        });
        jest.spyOn(investmentSimulationService, 'simulateInvestmentProjections').mockResolvedValue({
            categories: [],
            totals: {
                principal: 1000,
                contributions: 200,
                simpleFutureValue: 1300,
                compoundFutureValue: 1350,
                interestDelta: 150
            },
            options: { defaultPeriodMonths: 12 },
            generatedAt: new Date().toISOString()
        });
        app = createRouterTestApp({
            routes: [
                ['/', authRoutes],
                ['/dashboard', dashboardRoutes],
                ['/finance', financeRoutes],
                ['/notifications', notificationRoutes],
                ['/pos', posRoutes]
            ]
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
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
        const redirectResponse = await agent.get('/finance');
        expect(redirectResponse.status).toBe(302);
        expect(redirectResponse.headers.location).toBe('/finance/overview');

        const response = await agent.get('/finance/overview');

        expect(financeReportingService.getFinanceSummary).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 1000 })
        );
        expect(FinanceGoal.findAll).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ userId: 1000 })
        }));
        expect(budgetService.getBudgetOverview).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 1000 }),
            expect.objectContaining({ includeCategoryConsumption: true })
        );
        expect(response.status).toBe(200);
        expect(response.text).toContain('Gerenciar finanças estratégicas');
        expect(response.text).toContain('Visão rápida de resultados');
        expect(response.text).toContain('Limites e alertas globais');
        expect(response.text).toContain('Metas e projeções');
        expect(response.text).toContain('Configurar metas mensais');
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

    it('permite que usuários autorizados acessem o PDV', async () => {
        const { agent } = await authenticateTestUser(app, { role: USER_ROLES.MANAGER });

        const response = await agent.get('/pos');

        expect(response.status).toBe(200);
        expect(response.text).toContain('Ponto de Venda Inteligente');
    });
});
