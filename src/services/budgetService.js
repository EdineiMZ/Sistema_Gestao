const { Budget } = require('../../database/models');

const buildUserFilter = (userId) => {
    if (userId === undefined || userId === null) {
        return {};
    }
    return { userId };
};

const buildCategoryFilter = (financeCategoryId) => {
    if (!financeCategoryId) {
        return {};
    }
    return { financeCategoryId };
};

const listBudgets = async ({ userId, financeCategoryId } = {}) => {
    const where = {
        ...buildUserFilter(userId),
        ...buildCategoryFilter(financeCategoryId)
    };

    return Budget.findAll({
        where,
        order: [['referenceMonth', 'DESC'], ['financeCategoryId', 'ASC']]
    });
};

const findBudgetById = async ({ id, userId }) => {
    const where = { id, ...buildUserFilter(userId) };
    return Budget.findOne({ where });
};

const saveBudget = async ({ id, monthlyLimit, thresholds, referenceMonth, userId, financeCategoryId }) => {
    if (id) {
        const budget = await findBudgetById({ id, userId });
        if (!budget) {
            const error = new Error('Orçamento não encontrado.');
            error.code = 'BUDGET_NOT_FOUND';
            throw error;
        }

        budget.monthlyLimit = monthlyLimit;
        budget.thresholds = thresholds;
        budget.referenceMonth = referenceMonth;
        budget.userId = userId;
        budget.financeCategoryId = financeCategoryId;

        await budget.save();
        return budget;
    }

    return Budget.create({
        monthlyLimit,
        thresholds,
        referenceMonth,
        userId,
        financeCategoryId
    });
};

const deleteBudget = async ({ id, userId }) => {
    const budget = await findBudgetById({ id, userId });
    if (!budget) {
        const error = new Error('Orçamento não encontrado.');
        error.code = 'BUDGET_NOT_FOUND';
        throw error;
    }

    await budget.destroy();
};

module.exports = {
    listBudgets,
    saveBudget,
    deleteBudget
};
