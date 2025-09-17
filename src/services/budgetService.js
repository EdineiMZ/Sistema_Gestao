const { Budget } = require('../../database/models');

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

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

const normalizePagination = (page, pageSize) => {
    const normalizedPage = Number.isInteger(page) && page > 0 ? page : DEFAULT_PAGE;
    const normalizedPageSize = Number.isInteger(pageSize) && pageSize > 0
        ? Math.min(pageSize, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;

    return {
        page: normalizedPage,
        pageSize: normalizedPageSize
    };
};

const budgetListCache = new Map();

const buildCacheKey = ({ where, page, pageSize }) => JSON.stringify({ where, page, pageSize });

const listBudgets = async (filtersOrOptions = {}, paginationOptions = {}) => {
    const {
        userId,
        financeCategoryId,
        page: inlinePage,
        pageSize: inlinePageSize,
        ...additionalFilters
    } = filtersOrOptions || {};

    const filters = {
        ...additionalFilters,
        ...buildUserFilter(userId),
        ...buildCategoryFilter(financeCategoryId)
    };

    const { page: normalizedPage, pageSize: normalizedPageSize } = normalizePagination(
        inlinePage !== undefined ? inlinePage : paginationOptions.page,
        inlinePageSize !== undefined ? inlinePageSize : paginationOptions.pageSize
    );

    const cacheKey = buildCacheKey({ where: filters, page: normalizedPage, pageSize: normalizedPageSize });

    if (budgetListCache.has(cacheKey)) {
        return budgetListCache.get(cacheKey);
    }

    const order = [['referenceMonth', 'DESC'], ['financeCategoryId', 'ASC']];

    try {
        const { rows, count } = await Budget.findAndCountAll({
            where: filters,
            order,
            limit: normalizedPageSize,
            offset: (normalizedPage - 1) * normalizedPageSize
        });

        const data = rows.map((row) => row.get({ plain: true }));
        const totalItems = Array.isArray(count)
            ? count.reduce((acc, item) => acc + Number(item.count || 0), 0)
            : Number(count) || 0;
        const totalPages = Math.ceil(totalItems / normalizedPageSize) || 0;
        const pagination = {
            page: normalizedPage,
            pageSize: normalizedPageSize,
            totalItems,
            totalPages
        };

        const result = { data, pagination };
        budgetListCache.set(cacheKey, result);
        return result;
    } catch (error) {
        if (error && typeof error.message === 'string' && error.message.includes('no such table')) {
            const fallback = {
                data: [],
                pagination: {
                    page: DEFAULT_PAGE,
                    pageSize: DEFAULT_PAGE_SIZE,
                    totalItems: 0,
                    totalPages: 0
                }
            };
            budgetListCache.set(cacheKey, fallback);
            return fallback;
        }
        throw error;
    }
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
    deleteBudget,
    __testing: {
        clearCache: () => budgetListCache.clear()
    }
};
