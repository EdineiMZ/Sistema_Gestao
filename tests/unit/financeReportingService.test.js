const { getStatusSummary, getMonthlySummary, getMonthlyProjection, getFinanceSummary } = require('../../src/services/financeReportingService');
const models = require('../../database/models');

const { FinanceEntry, FinanceGoal } = models;

describe('financeReportingService', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('retorna estrutura vazia ao não encontrar lançamentos', async () => {
        jest.spyOn(FinanceEntry, 'findAll').mockResolvedValueOnce([]);

        const summary = await getStatusSummary();

        expect(summary).toEqual({
            payable: { pending: 0, paid: 0, overdue: 0, cancelled: 0 },
            receivable: { pending: 0, paid: 0, overdue: 0, cancelled: 0 }
        });
        expect(FinanceEntry.findAll).toHaveBeenCalledTimes(1);
        expect(FinanceEntry.findAll).toHaveBeenCalledWith(expect.objectContaining({
            group: expect.arrayContaining(['FinanceEntry.type', 'FinanceEntry.status']),
            raw: true
        }));
    });

    it('filtra lançamentos pelo usuário informado', async () => {
        const findSpy = jest.spyOn(FinanceEntry, 'findAll').mockResolvedValueOnce([]);

        await getStatusSummary({ userId: 77 });

        expect(findSpy).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ userId: 77 })
        }));
    });

    it('agrupa os lançamentos por status e tipo', async () => {
        jest.spyOn(FinanceEntry, 'findAll').mockResolvedValueOnce([
            { type: 'payable', status: 'pending', totalValue: '120.50' },
            { type: 'payable', status: 'paid', totalValue: '80' },
            { type: 'receivable', status: 'paid', totalValue: '150.20' },
            { type: 'receivable', status: 'overdue', totalValue: '200' },
            { type: 'receivable', status: 'cancelled', totalValue: '50' },
            { type: 'invalid', status: 'pending', totalValue: '999' }
        ]);

        const summary = await getStatusSummary();

        expect(summary).toEqual({
            payable: { pending: 120.5, paid: 80, overdue: 0, cancelled: 0 },
            receivable: { pending: 0, paid: 150.2, overdue: 200, cancelled: 50 }
        });
    });

    it('organiza os dados por mês', async () => {
        jest.spyOn(FinanceEntry, 'findAll').mockResolvedValueOnce([
            { month: '2024-01', type: 'payable', totalValue: 150 },
            { month: '2024-01', type: 'receivable', totalValue: 150 },
            { month: '2024-02', type: 'receivable', totalValue: 320 },
            { month: '2024-03', type: 'invalid', totalValue: 999 }
        ]);

        const summary = await getMonthlySummary();

        expect(summary).toEqual([
            { month: '2024-01', payable: 150, receivable: 150 },
            { month: '2024-02', payable: 0, receivable: 320 }
        ]);
    });

    it('calcula resumo completo reutilizando lançamentos pré-carregados', async () => {
        const entries = [
            { type: 'payable', status: 'pending', value: 100, dueDate: '2024-03-01' },
            { type: 'receivable', status: 'paid', value: 250, dueDate: '2024-03-02' }
        ];

        const findAllSpy = jest.spyOn(FinanceEntry, 'findAll');
        const goalSpy = jest.spyOn(FinanceGoal, 'findAll').mockResolvedValue([]);

        const summary = await getFinanceSummary(
            { userId: 10, referenceDate: '2024-03-05', projectionMonths: 1 },
            { entries }
        );

        expect(findAllSpy).not.toHaveBeenCalled();
        expect(goalSpy).toHaveBeenCalledTimes(1);
        expect(goalSpy).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ userId: 10 })
        }));
        expect(summary.statusSummary).toEqual({
            payable: { pending: 100, paid: 0, overdue: 0, cancelled: 0 },
            receivable: { pending: 0, paid: 250, overdue: 0, cancelled: 0 }
        });
        expect(summary.monthlySummary).toEqual([
            { month: '2024-03', payable: 100, receivable: 250 }
        ]);
        expect(summary.totals).toEqual({
            payable: 100,
            receivable: 250,
            net: 150,
            overdue: 0,
            paid: 250,
            pending: 100
        });
        expect(Array.isArray(summary.projections)).toBe(true);
        expect(summary.projections.length).toBe(1);
    });

    it('projeta lançamentos recorrentes e compara com metas', async () => {
        const entryData = [
            {
                type: 'receivable',
                status: 'pending',
                value: 500,
                dueDate: '2024-07-05',
                recurring: true,
                recurringInterval: 'monthly'
            },
            {
                type: 'payable',
                status: 'pending',
                value: 200,
                dueDate: '2024-07-10',
                recurring: true,
                recurringInterval: 'mensal'
            }
        ];

        jest.spyOn(FinanceEntry, 'findAll').mockResolvedValue(entryData);
        jest.spyOn(FinanceGoal, 'findAll').mockResolvedValue([
            { id: 1, month: '2024-08-01', targetNetAmount: '400.00', notes: null },
            { id: 2, month: '2024-09-01', targetNetAmount: '250.00', notes: null }
        ]);

        const projections = await getMonthlyProjection({ userId: 22, referenceDate: '2024-07-15', projectionMonths: 3 });

        expect(Array.isArray(projections)).toBe(true);
        expect(projections).toHaveLength(3);

        const august = projections.find((item) => item.month === '2024-08');
        const september = projections.find((item) => item.month === '2024-09');

        expect(august).toBeDefined();
        expect(august.projected.net).toBeCloseTo(300, 2);
        expect(august.goal).toMatchObject({ achieved: false });
        expect(august.goal.gapToGoal).toBeCloseTo(-100, 2);

        expect(september).toBeDefined();
        expect(september.projected.net).toBeCloseTo(300, 2);
        expect(september.goal).toMatchObject({ achieved: true });
        expect(september.goal.gapToGoal).toBeCloseTo(50, 2);
    });

    it('filtra metas por usuário ao gerar projeções', async () => {
        jest.spyOn(FinanceEntry, 'findAll').mockResolvedValue([]);
        const goalSpy = jest.spyOn(FinanceGoal, 'findAll').mockResolvedValue([]);

        await getMonthlyProjection({ userId: 33, referenceDate: '2024-01-10', projectionMonths: 2 });

        expect(goalSpy).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ userId: 33 })
        }));
    });

    it('não consulta metas quando usuário não é informado', async () => {
        jest.spyOn(FinanceEntry, 'findAll').mockResolvedValue([]);
        const goalSpy = jest.spyOn(FinanceGoal, 'findAll').mockResolvedValue([]);

        await getMonthlyProjection({ referenceDate: '2024-02-01', projectionMonths: 1 });

        expect(goalSpy).not.toHaveBeenCalled();
    });
});
