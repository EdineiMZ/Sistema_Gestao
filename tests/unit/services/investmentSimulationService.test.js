jest.mock('../../../database/models', () => {
    const { Op } = require('sequelize');
    return {
        FinanceCategory: {
            findAll: jest.fn()
        },
        FinanceCategoryRate: {
            findAll: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn()
        },
        Sequelize: { Op }
    };
});

const models = require('../../../database/models');
const investmentSimulationService = require('../../../src/services/investmentSimulationService');

describe('investmentSimulationService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('calcula juros simples incluindo aportes recorrentes', () => {
        const projection = investmentSimulationService.calculateSimpleInterestProjection({
            principal: 1000,
            monthlyRate: 0.01,
            periods: 6,
            monthlyContribution: 200
        });

        expect(projection.futureValue).toBeGreaterThan(0);
        expect(projection.futureValue).toBeGreaterThan(projection.principal + projection.totalContributions);
        expect(projection.breakdown).toHaveLength(6);
    });

    it('calcula juros compostos com aportes mensais', () => {
        const projection = investmentSimulationService.calculateCompoundInterestProjection({
            principal: 1500,
            monthlyRate: 0.012,
            periods: 12,
            monthlyContribution: 300
        });

        expect(projection.futureValue).toBeGreaterThan(projection.principal);
        expect(projection.totalInterest).toBeCloseTo(projection.futureValue - (projection.principal + projection.totalContributions), 6);
        expect(projection.breakdown[projection.breakdown.length - 1].accumulatedBalance).toBeCloseTo(projection.futureValue, 6);
    });

    it('agrega lançamentos por categoria utilizando taxas personalizadas', async () => {
        const entries = [
            { id: 1, financeCategoryId: 3, type: 'receivable', value: 1000 },
            { id: 2, financeCategoryId: 3, type: 'receivable', value: 500 },
            { id: 3, financeCategoryId: 4, type: 'payable', value: 300 }
        ];

        models.FinanceCategoryRate.findAll.mockResolvedValue([
            {
                get: () => ({
                    id: 9,
                    userId: 12,
                    financeCategoryId: 3,
                    ratePeriod: 'annual',
                    simpleRate: 0.12,
                    compoundRate: 0.12,
                    contributionAmount: 200,
                    contributionFrequency: 'monthly',
                    periodMonths: 6
                })
            }
        ]);

        models.FinanceCategory.findAll.mockResolvedValue([
            { get: () => ({ id: 3, name: 'Consultorias', color: '#123456' }) }
        ]);

        const result = await investmentSimulationService.simulateInvestmentProjections({
            entries,
            userId: 12
        });

        expect(models.FinanceCategoryRate.findAll).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ financeCategoryId: expect.any(Object) })
        }));
        expect(result.categories).toHaveLength(1);
        const categoryProjection = result.categories[0];
        expect(categoryProjection.categoryName).toBe('Consultorias');
        expect(categoryProjection.principal).toBeCloseTo(1500, 2);

        const expectedSimple = investmentSimulationService.calculateSimpleInterestProjection({
            principal: 1500,
            monthlyRate: 0.01,
            periods: 6,
            monthlyContribution: 200
        });
        expect(categoryProjection.simple.futureValue).toBeCloseTo(expectedSimple.futureValue, 6);
    });

    it('realiza upsert de taxas personalizadas por usuário', async () => {
        const existing = {
            update: jest.fn().mockResolvedValue(),
            get: jest.fn().mockReturnValue({
                id: 5,
                userId: 7,
                financeCategoryId: 9,
                ratePeriod: 'monthly',
                simpleRate: 0.015,
                compoundRate: 0.015,
                contributionAmount: 250,
                contributionFrequency: 'monthly',
                periodMonths: 8
            })
        };

        models.FinanceCategoryRate.findOne.mockResolvedValue(existing);

        const updated = await investmentSimulationService.upsertCategoryRate({
            userId: 7,
            financeCategoryId: 9,
            simpleRate: 0.018,
            compoundRate: 0.02,
            contributionAmount: 300,
            contributionFrequency: 'quarterly',
            periodMonths: 10
        });

        expect(existing.update).toHaveBeenCalledWith(expect.objectContaining({
            simpleRate: 0.018,
            compoundRate: 0.02,
            contributionAmount: 300,
            contributionFrequency: 'quarterly',
            periodMonths: 10
        }), { transaction: undefined });
        expect(updated.userId).toBe(7);
        expect(updated.financeCategoryId).toBe(9);

        models.FinanceCategoryRate.findOne.mockResolvedValue(null);
        models.FinanceCategoryRate.create.mockResolvedValue({
            get: () => ({
                id: 11,
                userId: 7,
                financeCategoryId: 15,
                ratePeriod: 'annual',
                simpleRate: 0.1,
                compoundRate: 0.11,
                contributionAmount: 150,
                contributionFrequency: 'monthly',
                periodMonths: 12
            })
        });

        const created = await investmentSimulationService.upsertCategoryRate({
            userId: 7,
            financeCategoryId: 15,
            simpleRate: 0.1,
            compoundRate: 0.11,
            contributionAmount: 150
        });

        expect(models.FinanceCategoryRate.create).toHaveBeenCalled();
        expect(created.financeCategoryId).toBe(15);
        expect(created.ratePeriod).toBe('annual');
    });
});
