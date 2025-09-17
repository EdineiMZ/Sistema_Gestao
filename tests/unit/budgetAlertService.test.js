const budgetAlertService = require('../../src/services/budgetAlertService');
const financeReportingService = require('../../src/services/financeReportingService');

jest.mock('../../src/services/financeReportingService', () => ({
    getBudgetSummaries: jest.fn(),
    getCategoryConsumption: jest.fn()
}));

describe('budgetAlertService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const mockOverview = (summaries = [], categoryConsumption = []) => {
        financeReportingService.getBudgetSummaries.mockResolvedValue({
            summaries,
            categoryConsumption,
            months: ['2024-01']
        });
        financeReportingService.getCategoryConsumption.mockResolvedValue(categoryConsumption);
    };

    it('retorna lista vazia quando não existem budgets ativos', async () => {
        mockOverview([
            { budgetId: 1, monthlyLimit: 0 },
            { budgetId: 2, monthlyLimit: -10 }
        ]);

        const result = await budgetAlertService.getBudgetAlerts();

        expect(result).toEqual([]);
        expect(financeReportingService.getBudgetSummaries).toHaveBeenCalledWith({}, expect.objectContaining({ includeCategoryConsumption: true }));
        expect(financeReportingService.getCategoryConsumption).not.toHaveBeenCalled();
    });

    it('ignora budgets abaixo dos thresholds definidos', async () => {
        mockOverview([
            {
                budgetId: 3,
                categoryId: 9,
                categoryName: 'Marketing',
                monthlyLimit: 1000,
                consumption: 400,
                thresholds: [0.5, 0.8],
                month: '2024-01',
                monthLabel: 'janeiro/2024'
            }
        ]);

        const result = await budgetAlertService.getBudgetAlerts({});

        expect(result).toEqual([]);
        expect(financeReportingService.getCategoryConsumption).toHaveBeenCalledWith({}, expect.objectContaining({ budgetOverview: expect.any(Object) }));
    });

    it('identifica o maior limiar atingido e calcula os percentuais', async () => {
        const summaries = [
            {
                budgetId: 7,
                categoryId: 12,
                categoryName: 'Operações',
                categorySlug: 'operacoes',
                categoryColor: '#123456',
                monthlyLimit: 1000,
                consumption: 950,
                thresholds: [0.5, 0.75, 0.9],
                month: '2024-02',
                monthLabel: 'fevereiro/2024',
                remaining: 50,
                status: 'warning',
                statusLabel: 'Atenção'
            }
        ];
        const categoryConsumption = [
            {
                categoryId: 12,
                totalLimit: 1000,
                totalConsumption: 950,
                remaining: 50,
                averagePercentage: 95,
                highestPercentage: 95,
                months: 1,
                status: 'warning',
                statusLabel: 'Atenção'
            }
        ];

        mockOverview(summaries, categoryConsumption);

        const result = await budgetAlertService.getBudgetAlerts({ region: 'sul' }, { userId: 15 });

        expect(result).toHaveLength(1);
        const alert = result[0];
        expect(alert.budgetId).toBe(7);
        expect(alert.category).toEqual({
            id: 12,
            name: 'Operações',
            slug: 'operacoes',
            color: '#123456'
        });
        expect(alert.consumptionRatio).toBeCloseTo(0.95, 4);
        expect(alert.consumptionPercentage).toBe(95);
        expect(alert.thresholdReached).toBe(0.9);
        expect(alert.thresholdsReached).toEqual([0.5, 0.75, 0.9]);
        expect(alert.month).toBe('2024-02');
        expect(alert.referencePeriod).toEqual({
            month: '2024-02',
            label: 'fevereiro/2024',
            startDate: '2024-02-01',
            endDate: '2024-02-29'
        });
        expect(alert.categoryTotals).toEqual({
            totalLimit: 1000,
            totalConsumption: 950,
            remaining: 50,
            averagePercentage: 95,
            highestPercentage: 95,
            months: 1,
            status: 'warning',
            statusLabel: 'Atenção',
            statusMeta: null
        });
    });

    it('considera thresholds com valores inconsistentes e múltiplos meses', async () => {
        const summaries = [
            {
                budgetId: 9,
                categoryId: 33,
                categoryName: 'TI',
                monthlyLimit: 500,
                consumption: 600,
                thresholds: [0, null, '0.8', 1.2, -1],
                month: '2024-03'
            },
            {
                budgetId: 9,
                categoryId: 33,
                categoryName: 'TI',
                monthlyLimit: 500,
                consumption: 200,
                thresholds: [0.6],
                month: '2024-04'
            }
        ];

        const categoryConsumption = [
            {
                categoryId: 33,
                totalLimit: 1000,
                totalConsumption: 800,
                remaining: 200,
                averagePercentage: 80,
                highestPercentage: 120,
                months: 2
            }
        ];

        mockOverview(summaries, categoryConsumption);

        const result = await budgetAlertService.getBudgetAlerts();

        expect(result).toHaveLength(1);
        const alert = result[0];
        expect(alert.thresholdsReached).toEqual([0.8, 1.2]);
        expect(alert.thresholdReached).toBe(1.2);
        expect(alert.consumptionRatio).toBe(1.2);
    });
});
