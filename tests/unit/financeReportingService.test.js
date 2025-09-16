const { getStatusSummary, getMonthlySummary, getFinanceSummary } = require('../../src/services/financeReportingService');
const models = require('../../database/models');

const { FinanceEntry } = models;

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
            attributes: ['id', 'type', 'status', 'value', 'dueDate'],
            raw: true
        }));
    });

    it('agrupa os lançamentos por status e tipo', async () => {
        jest.spyOn(FinanceEntry, 'findAll').mockResolvedValueOnce([
            { type: 'payable', status: 'pending', value: '120.50', dueDate: '2024-04-10' },
            { type: 'payable', status: 'paid', value: '80', dueDate: '2024-04-11' },
            { type: 'receivable', status: 'paid', value: '150.20', dueDate: '2024-04-12' },
            { type: 'receivable', status: 'overdue', value: '200', dueDate: '2024-05-01' },
            { type: 'receivable', status: 'cancelled', value: '50', dueDate: '2024-05-02' },
            { type: 'invalid', status: 'pending', value: '999', dueDate: '2024-06-01' }
        ]);

        const summary = await getStatusSummary();

        expect(summary).toEqual({
            payable: { pending: 120.5, paid: 80, overdue: 0, cancelled: 0 },
            receivable: { pending: 0, paid: 150.2, overdue: 200, cancelled: 50 }
        });
    });

    it('organiza os dados por mês', async () => {
        jest.spyOn(FinanceEntry, 'findAll').mockResolvedValueOnce([
            { type: 'payable', status: 'pending', value: 100, dueDate: '2024-01-15' },
            { type: 'payable', status: 'paid', value: 50, dueDate: '2024-01-20' },
            { type: 'receivable', status: 'paid', value: '200', dueDate: '2024-02-05' },
            { type: 'receivable', status: 'paid', value: '150', dueDate: '2024-01-08' },
            { type: 'receivable', status: 'paid', value: '120', dueDate: '2024-02-12' },
            { type: 'payable', status: 'paid', value: '10', dueDate: 'invalid-date' }
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

        const summary = await getFinanceSummary({}, { entries });

        expect(findAllSpy).not.toHaveBeenCalled();
        expect(summary).toEqual({
            statusSummary: {
                payable: { pending: 100, paid: 0, overdue: 0, cancelled: 0 },
                receivable: { pending: 0, paid: 250, overdue: 0, cancelled: 0 }
            },
            monthlySummary: [
                { month: '2024-03', payable: 100, receivable: 250 }
            ],
            totals: {
                payable: 100,
                receivable: 250,
                net: 150,
                overdue: 0,
                paid: 250,
                pending: 100
            }
        });
    });
});
