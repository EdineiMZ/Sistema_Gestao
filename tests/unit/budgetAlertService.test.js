const mockFindOrCreate = jest.fn();
const mockFindOne = jest.fn();

jest.mock('../../database/models', () => ({
    BudgetThresholdStatus: {
        findOrCreate: mockFindOrCreate,
        findOne: mockFindOne
    }
}));

const { registerBudgetAlertTrigger } = require('../../src/services/budgetAlertService');

describe('budgetAlertService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('registra um novo disparo quando não existe status prévio', async () => {
        const mockRecord = { id: 10 };
        const now = new Date('2024-09-10T10:00:00Z');

        mockFindOrCreate.mockResolvedValueOnce([mockRecord, true]);

        const result = await registerBudgetAlertTrigger({
            budgetId: 5,
            threshold: 50,
            referenceMonth: '2024-09',
            triggeredAt: now
        });

        expect(mockFindOrCreate).toHaveBeenCalledTimes(1);
        expect(mockFindOrCreate).toHaveBeenCalledWith({
            where: {
                budgetId: 5,
                referenceMonth: '2024-09-01',
                threshold: '50.00'
            },
            defaults: {
                triggeredAt: now
            },
            transaction: null
        });

        expect(result.shouldDispatch).toBe(true);
        expect(result.created).toBe(true);
        expect(result.record).toBe(mockRecord);
    });

    it('evita disparo duplicado quando já existe registro para o limiar', async () => {
        const existingRecord = { id: 99, update: jest.fn().mockResolvedValue(null) };

        mockFindOrCreate.mockResolvedValueOnce([existingRecord, false]);

        const result = await registerBudgetAlertTrigger({
            budgetId: '8',
            threshold: '75',
            referenceMonth: '2024-09-15',
            triggeredAt: '2024-09-20T12:00:00Z'
        });

        expect(mockFindOrCreate).toHaveBeenCalledTimes(1);
        expect(mockFindOrCreate).toHaveBeenCalledWith({
            where: {
                budgetId: 8,
                referenceMonth: '2024-09-01',
                threshold: '75.00'
            },
            defaults: {
                triggeredAt: expect.any(Date)
            },
            transaction: null
        });

        expect(existingRecord.update).toHaveBeenCalledTimes(1);
        expect(existingRecord.update).toHaveBeenCalledWith({
            triggeredAt: expect.any(Date)
        }, { transaction: null });

        expect(result.shouldDispatch).toBe(false);
        expect(result.created).toBe(false);
        expect(result.record).toBe(existingRecord);
    });
});
