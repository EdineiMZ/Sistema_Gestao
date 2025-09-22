jest.mock('../../../database/models', () => {
    const { Op } = require('sequelize');

    return {
        FinanceEntry: {
            create: jest.fn(),
            findAll: jest.fn(),
            findByPk: jest.fn(),
            findOne: jest.fn(),
            count: jest.fn()
        },
        Sequelize: { Op }
    };
});

const { FinanceEntry } = require('../../../database/models');
const financeController = require('../../../src/controllers/financeController');
const financeReportingService = require('../../../src/services/financeReportingService');

const buildResponseMock = () => ({
    redirect: jest.fn(),
    render: jest.fn()
});

describe('financeController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    it('mapeia rótulos traduzidos para intervalos aceitos ao criar um lançamento', async () => {
        const req = {
            body: {
                description: 'Assinatura do serviço',
                type: 'payable',
                value: '199.90',
                dueDate: '2024-01-10',
                recurring: 'true',
                recurringInterval: 'Mensal'
            },
            flash: jest.fn(),
            user: { id: 42 }
        };
        const res = buildResponseMock();

        FinanceEntry.create.mockResolvedValue({ id: 42 });

        await financeController.createFinanceEntry(req, res);

        expect(FinanceEntry.create).toHaveBeenCalledWith(
            expect.objectContaining({
                recurringInterval: 'monthly',
                userId: 42,
                status: 'pending',
                paymentDate: null,
                financeCategoryId: null,
                recurring: true,
                value: 199.9
            })
        );
        expect(req.flash).toHaveBeenCalledWith('success_msg', expect.any(String));
        expect(res.redirect).toHaveBeenCalledWith('/finance/payments');
    });

    it('mapeia rótulos traduzidos para intervalos aceitos ao atualizar um lançamento', async () => {
        const save = jest.fn();
        const entry = {
            id: 7,
            description: 'Original',
            type: 'payable',
            value: '0',
            dueDate: '2024-01-01',
            paymentDate: null,
            status: 'pending',
            recurring: false,
            recurringInterval: null,
            save
        };

        FinanceEntry.findByPk.mockResolvedValue(entry);
        FinanceEntry.findOne.mockResolvedValue(entry);

        const req = {
            params: { id: 7 },
            body: {
                description: 'Receita recorrente',
                type: 'receivable',
                value: '500.00',
                dueDate: '2024-02-15',
                paymentDate: '',
                status: 'paid',
                recurring: 'true',
                recurringInterval: 'Quinzenal'
            },
            flash: jest.fn(),
            user: { id: 7 }
        };
        const res = buildResponseMock();

        await financeController.updateFinanceEntry(req, res);

        expect(entry.recurringInterval).toBe('biweekly');
        expect(entry.recurring).toBe(true);
        expect(entry.value).toBe(500);
        expect(entry.paymentDate).toBeNull();
        expect(entry.status).toBe('paid');
        expect(save).toHaveBeenCalledTimes(1);
        expect(req.flash).toHaveBeenCalledWith('success_msg', expect.any(String));
        expect(res.redirect).toHaveBeenCalledWith('/finance/payments');
    });

    describe('renderPaymentsPage', () => {
        const buildRequest = (query = {}) => ({
            query,
            user: { id: 9 },
            flash: jest.fn(),
            session: {}
        });

        const minimalSummary = {
            totals: { receivable: 0, payable: 0, net: 0, overdue: 0, paid: 0, pending: 0 },
            statusSummary: { receivable: {}, payable: {} },
            monthlySummary: [],
            projections: []
        };

        it('aplica limite e deslocamento com base em page/pageSize e retorna paginação', async () => {
            FinanceEntry.count.mockResolvedValueOnce(12);
            FinanceEntry.findAll.mockResolvedValueOnce([
                { id: 51, description: 'Mensalidade', type: 'receivable', status: 'pending', value: '120', dueDate: '2024-01-10' }
            ]);
            jest.spyOn(financeReportingService, 'getFinanceSummary').mockResolvedValue(minimalSummary);

            const req = buildRequest({ page: '2', pageSize: '5' });
            const res = buildResponseMock();

            await financeController.renderPaymentsPage(req, res);

            expect(FinanceEntry.count).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({ userId: 9 })
            }));
            expect(FinanceEntry.findAll).toHaveBeenCalledWith(expect.objectContaining({
                limit: 5,
                offset: 5
            }));
            expect(res.render).toHaveBeenCalledWith('finance/payments', expect.objectContaining({
                pagination: expect.objectContaining({
                    page: 2,
                    pageSize: 5,
                    totalPages: 3,
                    totalRecords: 12
                })
            }));
        });

        it('ajusta a página quando o valor excede o total de registros', async () => {
            FinanceEntry.count.mockResolvedValueOnce(6);
            FinanceEntry.findAll.mockResolvedValueOnce([
                { id: 77, description: 'Compra de materiais', type: 'payable', status: 'pending', value: '90', dueDate: '2024-01-12' }
            ]);
            jest.spyOn(financeReportingService, 'getFinanceSummary').mockResolvedValue(minimalSummary);

            const req = buildRequest({ page: '10', pageSize: '5' });
            const res = buildResponseMock();

            await financeController.renderPaymentsPage(req, res);

            expect(FinanceEntry.findAll).toHaveBeenCalledWith(expect.objectContaining({
                limit: 5,
                offset: 5
            }));
            expect(res.render).toHaveBeenCalledWith('finance/payments', expect.objectContaining({
                pagination: expect.objectContaining({
                    page: 2,
                    totalPages: 2,
                    totalRecords: 6
                })
            }));
        });
    });
});
