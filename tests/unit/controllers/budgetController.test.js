jest.mock('../../../src/services/budgetService', () => ({
    listBudgets: jest.fn(),
    saveBudget: jest.fn(),
    deleteBudget: jest.fn()
}));

jest.mock('../../../src/utils/logger', () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
}));

const budgetService = require('../../../src/services/budgetService');
const budgetController = require('../../../src/controllers/budgetController');

const buildResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

describe('budgetController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('list', () => {
        it('retorna orçamentos sem paginação quando serviço responde lista simples', async () => {
            const budgets = [{ id: 1, monthlyLimit: '1000.00' }];
            budgetService.listBudgets.mockResolvedValue(budgets);

            const req = { user: { id: 5 }, query: { financeCategoryId: '8' } };
            const res = buildResponse();

            await budgetController.list(req, res);

            expect(budgetService.listBudgets).toHaveBeenCalledWith({ userId: 5, financeCategoryId: 8 });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: 'Operação realizada com sucesso.',
                data: budgets
            });
            expect(res.json.mock.calls[0][0]).not.toHaveProperty('pagination');
        });

        it('retorna orçamentos com paginação quando serviço fornece metadados', async () => {
            const budgets = [{ id: 10, monthlyLimit: '2000.00' }];
            const pagination = { page: 2, pageSize: 10, totalItems: 25, totalPages: 3 };
            budgetService.listBudgets.mockResolvedValue({ data: budgets, pagination });

            const req = { user: { id: 7 }, query: {} };
            const res = buildResponse();

            await budgetController.list(req, res);

            expect(budgetService.listBudgets).toHaveBeenCalledWith({ userId: 7, financeCategoryId: undefined });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: 'Operação realizada com sucesso.',
                data: budgets,
                pagination
            });
        });

        it('retorna 400 para parâmetro de categoria inválido', async () => {
            const req = { user: { id: 3 }, query: { financeCategoryId: 'abc' } };
            const res = buildResponse();

            await budgetController.list(req, res);

            expect(budgetService.listBudgets).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
        });
    });

    describe('save', () => {
        it('cria orçamento com sucesso', async () => {
            const budget = { id: 9, monthlyLimit: '1500.00' };
            budgetService.saveBudget.mockResolvedValue(budget);

            const req = {
                user: { id: 11 },
                body: {
                    financeCategoryId: '4',
                    monthlyLimit: '1500.00',
                    thresholds: ['500', '1000'],
                    referenceMonth: '2024-10'
                }
            };
            const res = buildResponse();

            await budgetController.save(req, res);

            expect(budgetService.saveBudget).toHaveBeenCalledWith({
                id: null,
                financeCategoryId: 4,
                monthlyLimit: 1500,
                thresholds: [500, 1000],
                referenceMonth: '2024-10-01',
                userId: 11
            });
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: 'Orçamento criado com sucesso.',
                data: budget
            });
        });

        it('normaliza thresholds fracionários e absolutos antes de salvar', async () => {
            const budget = { id: 15, monthlyLimit: '1800.00' };
            budgetService.saveBudget.mockResolvedValue(budget);

            const req = {
                user: { id: 25 },
                body: {
                    financeCategoryId: '6',
                    monthlyLimit: '1800.00',
                    thresholds: ['0.5', '200', ' 0.755 ', '200'],
                    referenceMonth: '2024-11'
                }
            };
            const res = buildResponse();

            await budgetController.save(req, res);

            expect(budgetService.saveBudget).toHaveBeenCalledWith({
                id: null,
                financeCategoryId: 6,
                monthlyLimit: 1800,
                thresholds: [0.5, 0.76, 200],
                referenceMonth: '2024-11-01',
                userId: 25
            });
            expect(res.status).toHaveBeenCalledWith(201);
        });

        it('retorna 400 quando limite mensal inválido', async () => {
            const req = {
                user: { id: 7 },
                body: {
                    financeCategoryId: '2',
                    monthlyLimit: '-10'
                }
            };
            const res = buildResponse();

            await budgetController.save(req, res);

            expect(budgetService.saveBudget).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: expect.stringContaining('Limite mensal')
            }));
        });
    });

    describe('delete', () => {
        it('remove orçamento com sucesso', async () => {
            const req = { params: { id: '3' }, user: { id: 20 } };
            const res = buildResponse();

            await budgetController.delete(req, res);

            expect(budgetService.deleteBudget).toHaveBeenCalledWith({ id: 3, userId: 20 });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: 'Orçamento removido com sucesso.',
                data: null
            });
        });

        it('retorna 404 quando orçamento não encontrado', async () => {
            budgetService.deleteBudget.mockRejectedValue({
                code: 'BUDGET_NOT_FOUND',
                message: 'Orçamento não encontrado.'
            });

            const req = { params: { id: '99' }, user: { id: 1 } };
            const res = buildResponse();

            await budgetController.delete(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'Orçamento não encontrado.'
            }));
        });
    });
});
