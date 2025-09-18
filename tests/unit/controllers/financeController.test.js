jest.mock('../../../database/models', () => {
    const { Op } = require('sequelize');

    return {
        FinanceEntry: {
            create: jest.fn(),
            findAll: jest.fn(),
            findByPk: jest.fn(),
            findOne: jest.fn()
        },
        Sequelize: { Op }
    };
});

const { FinanceEntry } = require('../../../database/models');
const financeController = require('../../../src/controllers/financeController');

const buildResponseMock = () => ({
    redirect: jest.fn()
});

describe('financeController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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
            expect.objectContaining({ recurringInterval: 'monthly', userId: 42 })
        );
        expect(req.flash).toHaveBeenCalledWith('success_msg', expect.any(String));
        expect(res.redirect).toHaveBeenCalledWith('/finance');
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
        expect(save).toHaveBeenCalledTimes(1);
        expect(req.flash).toHaveBeenCalledWith('success_msg', expect.any(String));
        expect(res.redirect).toHaveBeenCalledWith('/finance');
    });
});
