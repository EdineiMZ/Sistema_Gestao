process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const { createRouterTestApp } = require('../utils/createRouterTestApp');
const { authenticateTestUser } = require('../utils/authTestUtils');

const financeRoutes = require('../../src/routes/financeRoutes');
const financeReportingService = require('../../src/services/financeReportingService');
const budgetService = require('../../src/services/budgetService');
jest.mock('../../src/services/investmentSimulationService', () => ({
    simulateInvestmentProjections: jest.fn()
}));
const investmentSimulationService = require('../../src/services/investmentSimulationService');
const { FinanceEntry, Sequelize } = require('../../database/models');

describe('Finance routes filtering', () => {
    let app;

    beforeAll(() => {
        app = createRouterTestApp({
            routes: [['/finance', financeRoutes]]
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('applies filters and renders the computed summaries for the selected scope', async () => {
        const filteredEntries = [
            {
                id: 1,
                description: 'Plano empresarial',
                type: 'receivable',
                status: 'paid',
                value: '1200.50',
                dueDate: '2024-03-05',
                paymentDate: '2024-03-06',
                recurring: false,
                recurringInterval: null
            },
            {
                id: 2,
                description: 'Consultoria estratégica',
                type: 'receivable',
                status: 'paid',
                value: '800.00',
                dueDate: '2024-03-18',
                paymentDate: '2024-03-19',
                recurring: false,
                recurringInterval: null
            }
        ];

        jest.spyOn(FinanceEntry, 'findAll').mockResolvedValue(filteredEntries);
        const countSpy = jest.spyOn(FinanceEntry, 'count').mockResolvedValue(filteredEntries.length);
        const summarySpy = jest.spyOn(financeReportingService, 'getFinanceSummary').mockResolvedValue({
            totals: {
                receivable: 2000.5,
                payable: 0,
                net: 2000.5,
                overdue: 150.25,
                paid: 1800.25,
                pending: 200.25
            },
            statusSummary: {
                receivable: { pending: 200.25, paid: 1800.25, overdue: 0, cancelled: 0 },
                payable: { pending: 0, paid: 0, overdue: 150.25, cancelled: 0 }
            },
            monthlySummary: [
                { month: '2024-03', receivable: 2000.5, payable: 150.25 }
            ],
            projections: [
                {
                    month: '2024-03',
                    label: 'março de 2024',
                    projected: { net: 2000.5 },
                    goal: { targetNetAmount: 2500, gapToGoal: -499.5, achieved: false },
                    isCurrent: true,
                    isFuture: false,
                    hasGoal: true,
                    needsAttention: true
                }
            ],
            highlightProjection: {
                month: '2024-04',
                label: 'abril de 2024',
                projected: { net: 3200.75 },
                goal: { targetNetAmount: 3000, gapToGoal: 200.75, achieved: true }
            },
            projectionAlerts: [
                {
                    month: '2024-03',
                    label: 'março de 2024',
                    projected: { net: 2000.5 },
                    goal: { targetNetAmount: 2500, gapToGoal: -499.5, achieved: false },
                    needsAttention: true
                }
            ],
            periodLabel: 'março de 2024'
        });
        investmentSimulationService.simulateInvestmentProjections.mockResolvedValue({
            categories: [],
            totals: { principal: 0, contributions: 0, simpleFutureValue: 0, compoundFutureValue: 0, interestDelta: 0 },
            options: { defaultPeriodMonths: 12 },
            generatedAt: new Date().toISOString()
        });
        const budgetSpy = jest.spyOn(budgetService, 'getBudgetOverview').mockResolvedValue({
            summaries: [
                {
                    id: 55,
                    month: '2024-03',
                    financeCategoryId: 11,
                    categoryName: 'Consultorias',
                    categoryColor: '#2563eb',
                    monthlyLimit: 1500,
                    consumption: 750,
                    usage: 50,
                    status: 'healthy',
                    statusMeta: { key: 'healthy' }
                }
            ],
            categoryConsumption: [
                {
                    categoryId: 11,
                    categoryName: 'Consultorias',
                    categoryColor: '#2563eb',
                    totalConsumption: 750,
                    totalLimit: 1500,
                    remaining: 750,
                    averagePercentage: 50,
                    highestPercentage: 65,
                    months: 1,
                    statusMeta: { key: 'healthy', badgeClass: 'bg-success-subtle text-success', barColor: '#10b981', label: 'Saudável' }
                }
            ],
            months: ['2024-03']
        });

        const { agent } = await authenticateTestUser(app);
        const response = await agent.get(
            '/finance/overview?startDate=2024-03-01&endDate=2024-03-31&type=receivable&status=paid'
        );

        expect(response.status).toBe(200);

        expect(countSpy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.any(Object) }));

        expect(summarySpy).toHaveBeenCalledWith(
            {
                startDate: '2024-03-01',
                endDate: '2024-03-31',
                type: 'receivable',
                status: 'paid',
                userId: 1000
            }
        );
        expect(budgetSpy).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ includeCategoryConsumption: true }));

        const normalizedHtml = response.text.replace(/\u00a0/g, ' ');
        expect(normalizedHtml).toContain('Visão rápida de resultados');
        expect(normalizedHtml).toContain('Limites e alertas globais');
        expect(normalizedHtml).toContain('Orçamentos monitorados');
        expect(normalizedHtml).toContain('R$ 2.000,50');
        expect(normalizedHtml).toContain('Metas e projeções');
        expect(normalizedHtml).toContain('Configurar metas mensais');
        expect(normalizedHtml).toContain('março de 2024');
    });
});
