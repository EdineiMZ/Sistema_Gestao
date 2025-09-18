process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const { createRouterTestApp } = require('../utils/createRouterTestApp');
const { authenticateTestUser } = require('../utils/authTestUtils');

const financeRoutes = require('../../src/routes/financeRoutes');
const financeReportingService = require('../../src/services/financeReportingService');
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

        const findAllSpy = jest.spyOn(FinanceEntry, 'findAll').mockResolvedValue(filteredEntries);
        const summarySpy = jest.spyOn(financeReportingService, 'getFinanceSummary');

        const { agent } = await authenticateTestUser(app);
        const response = await agent.get(
            '/finance?startDate=2024-03-01&endDate=2024-03-31&type=receivable&status=paid'
        );

        expect(response.status).toBe(200);
        expect(findAllSpy).toHaveBeenCalledTimes(1);

        const findAllArgs = findAllSpy.mock.calls[0][0];
        expect(findAllArgs).toMatchObject({
            order: expect.any(Array),
            where: expect.objectContaining({
                type: 'receivable',
                status: 'paid',
                userId: 1000
            })
        });

        const { Op } = Sequelize;
        expect(findAllArgs.where.dueDate[Op.gte]).toBe('2024-03-01');
        expect(findAllArgs.where.dueDate[Op.lte]).toBe('2024-03-31');

        expect(summarySpy).toHaveBeenCalledWith(
            {
                startDate: '2024-03-01',
                endDate: '2024-03-31',
                type: 'receivable',
                status: 'paid',
                userId: 1000
            },
            expect.objectContaining({ entries: filteredEntries })
        );

        const normalizedHtml = response.text.replace(/\u00a0/g, ' ');
        expect(normalizedHtml).toContain('Visão consolidada');
        expect(normalizedHtml).toContain('R$ 2.000,50');
        expect(normalizedHtml).toContain('Status por categoria');
        expect(normalizedHtml).toContain('<option value="receivable" selected>');
        expect(normalizedHtml).toContain('<option value="paid" selected>');
        expect(normalizedHtml).toContain('Performance mensal');
        expect(normalizedHtml).toContain('março de 2024');
    });
});
