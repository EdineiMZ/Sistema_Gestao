const budgetService = require('../../../src/services/budgetService');
const financeReportingService = require('../../../src/services/financeReportingService');
const models = require('../../../database/models');

const { Budget } = models;

const clearCache = () => {
    if (budgetService.__testing && typeof budgetService.__testing.clearCache === 'function') {
        budgetService.__testing.clearCache();
    }
};

describe('budgetService', () => {
    afterEach(() => {
        jest.restoreAllMocks();
        clearCache();
    });

    it('lista orçamentos com paginação e reutiliza cache', async () => {
        const rows = [
            {
                get: jest.fn().mockReturnValue({
                    id: 1,
                    monthlyLimit: 1200,
                    userId: 10,
                    financeCategoryId: 5
                })
            }
        ];

        const findAndCountSpy = jest.spyOn(Budget, 'findAndCountAll').mockResolvedValue({
            rows,
            count: 1
        });

        const firstCall = await budgetService.listBudgets({ userId: 10 }, { page: 1, pageSize: 10 });
        expect(firstCall).toMatchObject({
            data: [
                expect.objectContaining({ id: 1, monthlyLimit: 1200, userId: 10, financeCategoryId: 5 })
            ],
            pagination: expect.objectContaining({ page: 1, pageSize: 10, totalItems: 1, totalPages: 1 })
        });

        const secondCall = await budgetService.listBudgets({ userId: 10 }, { page: 1, pageSize: 10 });
        expect(secondCall).toEqual(firstCall);
        expect(findAndCountSpy).toHaveBeenCalledTimes(1);

        const createSpy = jest.spyOn(Budget, 'create').mockResolvedValue({
            get: jest.fn().mockImplementation(() => ({
                id: 2,
                monthlyLimit: 1800,
                thresholds: [900],
                userId: 10,
                financeCategoryId: 7
            }))
        });

        await budgetService.createBudget({
            monthlyLimit: '1.800,00',
            thresholds: ['900', ' 600 '],
            userId: '10',
            financeCategoryId: '7'
        });

        expect(createSpy).toHaveBeenCalledWith({
            monthlyLimit: 1800,
            thresholds: [600, 900],
            userId: 10,
            financeCategoryId: 7
        }, {});

        findAndCountSpy.mockClear();

        await budgetService.listBudgets({ userId: 10 }, { page: 1, pageSize: 10 });
        expect(findAndCountSpy).toHaveBeenCalledTimes(1);
    });

    it('atualiza orçamento existente normalizando campos', async () => {
        const budgetInstance = {
            monthlyLimit: 1500,
            thresholds: [600],
            save: jest.fn().mockResolvedValue(),
            get: jest.fn().mockImplementation(() => ({
                id: 5,
                monthlyLimit: budgetInstance.monthlyLimit,
                thresholds: budgetInstance.thresholds,
                userId: 2,
                financeCategoryId: 4
            }))
        };

        const findSpy = jest.spyOn(Budget, 'findByPk').mockResolvedValue(budgetInstance);

        const updated = await budgetService.updateBudget(5, {
            monthlyLimit: '1.750,50',
            thresholds: ['500', '1000'],
            referenceMonth: '2024-06'
        });

        expect(findSpy).toHaveBeenCalledWith(5, { transaction: undefined });
        expect(budgetInstance.monthlyLimit).toBeCloseTo(1750.5, 2);
        expect(budgetInstance.thresholds).toEqual([500, 1000]);
        expect(budgetInstance.referenceMonth).toBe('2024-06-01');
        expect(budgetInstance.save).toHaveBeenCalledWith({ transaction: undefined });
        expect(updated).toMatchObject({
            id: 5,
            monthlyLimit: 1750.5,
            thresholds: [500, 1000]
        });
    });

    it('retorna null ao tentar atualizar orçamento inexistente', async () => {
        jest.spyOn(Budget, 'findByPk').mockResolvedValue(null);
        const result = await budgetService.updateBudget(999, { monthlyLimit: 1000 });
        expect(result).toBeNull();
    });

    it('agrega consumo resumido de um orçamento', async () => {
        const summaries = {
            summaries: [
                {
                    budgetId: 42,
                    categoryId: 8,
                    month: '2024-01',
                    monthlyLimit: 1000,
                    consumption: 900,
                    thresholds: [800]
                },
                {
                    budgetId: 42,
                    categoryId: 8,
                    month: '2024-02',
                    monthlyLimit: 1000,
                    consumption: 900,
                    thresholds: [800]
                }
            ],
            categoryConsumption: [],
            months: ['2024-01', '2024-02']
        };

        const overviewSpy = jest.spyOn(financeReportingService, 'getBudgetSummaries').mockResolvedValue(summaries);

        const result = await budgetService.getBudgetConsumptionSummary(42, { userId: 1 });

        expect(overviewSpy).toHaveBeenCalledWith({ userId: 1 }, expect.objectContaining({ includeCategoryConsumption: true }));
        expect(result).toMatchObject({
            budgetId: 42,
            totalLimit: 2000,
            totalConsumption: 1800,
            status: 'warning'
        });
        expect(result.months).toEqual(['2024-01', '2024-02']);
    });

    it('retorna lista vazia quando tabela de orçamentos não existe', async () => {
        jest.spyOn(Budget, 'findAndCountAll').mockRejectedValue(new Error('no such table: budgets'));
        const result = await budgetService.listBudgets();
        expect(result).toEqual({
            data: [],
            pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 }
        });
    });
});
