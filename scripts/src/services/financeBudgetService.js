const { UniqueConstraintError, ValidationError } = require('sequelize');
const { Budget } = require('../../database/models');
const { validateThresholdList, BUDGET_THRESHOLD_ERROR } = require('../utils/financeBudgetUtils');

const buildBudgetPayload = ({
    userId,
    financeCategoryId,
    monthlyLimit,
    thresholds,
    referenceMonth
}) => ({
    userId,
    financeCategoryId,
    monthlyLimit,
    thresholds,
    referenceMonth: referenceMonth || null
});

const createBudget = async (data = {}) => {
    const normalizedThresholds = validateThresholdList(data.thresholds);
    const payload = buildBudgetPayload({ ...data, thresholds: normalizedThresholds });

    try {
        const budget = await Budget.create(payload);
        return budget;
    } catch (error) {
        if (error instanceof UniqueConstraintError) {
            const conflictError = new Error('Já existe um orçamento configurado para esta categoria.');
            conflictError.statusCode = 400;
            conflictError.name = error.name;
            throw conflictError;
        }

        if (error instanceof ValidationError) {
            const validationMessage = error.errors?.[0]?.message || 'Dados inválidos para criação do orçamento.';
            const validationError = new Error(validationMessage);
            validationError.statusCode = 400;
            validationError.name = error.name;
            throw validationError;
        }

        throw error;
    }
};

const updateBudget = async (budgetId, userId, data = {}) => {
    const budget = await Budget.findByPk(budgetId);
    if (!budget) {
        return null;
    }

    if (budget.userId !== userId) {
        const forbiddenError = new Error('Orçamento não pertence ao usuário autenticado.');
        forbiddenError.statusCode = 403;
        throw forbiddenError;
    }

    const updates = {};

    if (data.financeCategoryId !== undefined) {
        updates.financeCategoryId = data.financeCategoryId;
    }

    if (data.monthlyLimit !== undefined) {
        updates.monthlyLimit = data.monthlyLimit;
    }

    if (data.referenceMonth !== undefined) {
        updates.referenceMonth = data.referenceMonth || null;
    }

    if (data.thresholds !== undefined) {
        updates.thresholds = validateThresholdList(data.thresholds);
    }

    try {
        Object.assign(budget, updates);
        await budget.save();
        return budget;
    } catch (error) {
        if (error instanceof UniqueConstraintError) {
            const conflictError = new Error('Já existe um orçamento configurado para esta categoria.');
            conflictError.statusCode = 400;
            conflictError.name = error.name;
            throw conflictError;
        }

        if (error instanceof ValidationError) {
            const validationMessage = error.errors?.[0]?.message || 'Dados inválidos para atualização do orçamento.';
            const validationError = new Error(validationMessage);
            validationError.statusCode = 400;
            validationError.name = error.name;
            throw validationError;
        }

        if (error.name === BUDGET_THRESHOLD_ERROR || error.statusCode === 400) {
            throw error;
        }

        throw error;
    }
};

module.exports = {
    createBudget,
    updateBudget
};
