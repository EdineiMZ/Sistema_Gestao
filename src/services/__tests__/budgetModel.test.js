process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');

const models = require('../../../database/models');

const { Budget } = models;

const buildBudgetPayload = (overrides = {}) => ({
    monthlyLimit: 1000,
    thresholds: [0.25, 0.5, 0.75],
    referenceMonth: '2024-09-01',
    userId: 1,
    financeCategoryId: 1,
    ...overrides
});

test('normalizeThresholds arredonda e valida intervalo permitido', () => {
    const normalized = Budget.normalizeThresholds([0.123, '0.456', 1]);
    assert.deepEqual(normalized, [0.12, 0.46, 1]);
});

test('normalizeThresholds rejeita valores fora do intervalo 0-1', () => {
    assert.throws(() => Budget.normalizeThresholds([0, 1.2]), /0 e 1/);
    assert.throws(() => Budget.normalizeThresholds(['abc']), /números entre 0 e 1/);
});

test('Budget valida ordenação crescente e ausência de duplicidades', async () => {
    const budget = Budget.build(buildBudgetPayload({ thresholds: [0.25, 0.5, 0.75] }));
    await assert.doesNotReject(() => budget.validate());

    const unordered = Budget.build(buildBudgetPayload({ thresholds: [0.5, 0.25] }));
    await assert.rejects(() => unordered.validate(), /ordem crescente/);

    const duplicated = Budget.build(buildBudgetPayload({ thresholds: [0.3, 0.3] }));
    await assert.rejects(() => duplicated.validate(), /duplicidades/);
});
