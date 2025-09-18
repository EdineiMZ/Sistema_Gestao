const { Budget, FinanceCategory, Sequelize } = require('../../database/models');

const { ValidationError, UniqueConstraintError } = Sequelize || {};

const isValidationError = (error) => ValidationError && error instanceof ValidationError;
const isUniqueConstraintError = (error) => UniqueConstraintError && error instanceof UniqueConstraintError;

const normalizeMonthlyLimit = (value) => {
    if (value === undefined || value === null) {
        return undefined;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return Number(value.toFixed(2));
    }

    if (typeof value === 'string') {
        const cleaned = value.trim().replace(/\./g, '').replace(',', '.');
        const parsed = Number.parseFloat(cleaned);
        return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : undefined;
    }

    return undefined;
};

const normalizeThresholdsInput = (value) => {
    if (value === undefined || value === null) {
        return undefined;
    }

    if (Array.isArray(value)) {
        const normalized = value
            .map((item) => {
                const numeric = Number(item);
                return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : null;
            })
            .filter((item) => item !== null);

        return normalized;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return [Number(value.toFixed(2))];
    }

    if (typeof value === 'string') {
        if (!value.trim()) {
            return [];
        }

        const normalized = value
            .split(/[;,]+|\s+/)
            .map((item) => {
                const numeric = Number.parseFloat(item.replace(',', '.'));
                return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : null;
            })
            .filter((item) => item !== null);

        return normalized;
    }

    return [];
};

const normalizeReferenceMonth = (value) => {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }
        if (/^\d{4}-\d{2}$/.test(trimmed)) {
            return `${trimmed}-01`;
        }
        return trimmed;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
            return date.toISOString().slice(0, 10);
        }
    }

    return null;
};

const sanitizeBudget = (budget) => {
    if (!budget) {
        return null;
    }

    const plain = typeof budget.get === 'function' ? budget.get({ plain: true }) : budget;

    return {
        id: plain.id,
        monthlyLimit: plain.monthlyLimit !== undefined ? Number(plain.monthlyLimit) : null,
        thresholds: Array.isArray(plain.thresholds) ? plain.thresholds : [],
        referenceMonth: plain.referenceMonth || null,
        financeCategoryId: plain.financeCategoryId || plain.categoryId || null,
        userId: plain.userId || null,
        category: plain.category
            ? {
                id: plain.category.id,
                name: plain.category.name,
                slug: plain.category.slug,
                color: plain.category.color,
                isActive: plain.category.isActive
            }
            : null
    };
};

const sanitizeCategory = (category) => {
    if (!category) {
        return null;
    }

    const plain = typeof category.get === 'function' ? category.get({ plain: true }) : category;

    return {
        id: plain.id,
        name: plain.name,
        slug: plain.slug,
        color: plain.color,
        isActive: plain.isActive,
        ownerId: plain.ownerId
    };
};

const buildErrorResponse = (res, error) => {
    if (isValidationError(error)) {
        const messages = Array.isArray(error.errors)
            ? error.errors.map((item) => item.message).filter(Boolean)
            : [];
        return res.status(400).json({
            message: 'Falha de validação ao processar a solicitação.',
            errors: messages
        });
    }

    if (isUniqueConstraintError(error)) {
        const messages = Array.isArray(error.errors)
            ? error.errors.map((item) => item.message).filter(Boolean)
            : [];
        return res.status(409).json({
            message: 'Registro duplicado encontrado.',
            errors: messages
        });
    }

    // eslint-disable-next-line no-console
    console.error('Erro inesperado em adminFinanceController:', error);
    return res.status(500).json({ message: 'Erro interno ao processar a solicitação.' });
};

const getCategoryModel = () => {
    if (FinanceCategory && typeof FinanceCategory.scope === 'function') {
        try {
            const scoped = FinanceCategory.scope('all');
            if (scoped) {
                return scoped;
            }
        } catch (error) {
            // Caso a definição de escopo falhe, seguimos com o model principal.
        }
    }
    return FinanceCategory;
};

const listBudgets = async (req, res) => {
    try {
        const userId = req.user?.id;
        const budgets = await Budget.findAll({
            where: { userId },
            include: [
                {
                    association: 'category',
                    attributes: ['id', 'name', 'slug', 'color', 'isActive']
                }
            ],
            order: [['id', 'ASC']]
        });

        const data = Array.isArray(budgets) ? budgets.map(sanitizeBudget).filter(Boolean) : [];
        return res.status(200).json({ data });
    } catch (error) {
        return buildErrorResponse(res, error);
    }
};

const createBudget = async (req, res) => {
    try {
        const userId = req.user?.id;
        const {
            financeCategoryId,
            monthlyLimit,
            thresholds,
            referenceMonth
        } = req.body || {};

        const payload = {
            userId,
            financeCategoryId,
            monthlyLimit: normalizeMonthlyLimit(monthlyLimit),
            thresholds: normalizeThresholdsInput(thresholds),
            referenceMonth: normalizeReferenceMonth(referenceMonth)
        };

        const created = await Budget.create(payload);
        const data = sanitizeBudget(created);

        return res.status(201).json({ data });
    } catch (error) {
        return buildErrorResponse(res, error);
    }
};

const updateBudget = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        const {
            financeCategoryId,
            monthlyLimit,
            thresholds,
            referenceMonth
        } = req.body || {};

        const budget = await Budget.findOne({
            where: { id, userId },
            include: [
                {
                    association: 'category',
                    attributes: ['id', 'name', 'slug', 'color', 'isActive']
                }
            ]
        });

        if (!budget) {
            return res.status(404).json({ message: 'Orçamento não encontrado.' });
        }

        if (financeCategoryId !== undefined) {
            budget.financeCategoryId = financeCategoryId;
        }

        const normalizedLimit = normalizeMonthlyLimit(monthlyLimit);
        if (normalizedLimit !== undefined) {
            budget.monthlyLimit = normalizedLimit;
        }

        const normalizedThresholds = normalizeThresholdsInput(thresholds);
        if (normalizedThresholds !== undefined) {
            budget.thresholds = normalizedThresholds;
        }

        if (referenceMonth !== undefined) {
            budget.referenceMonth = normalizeReferenceMonth(referenceMonth);
        }

        await budget.save();

        const data = sanitizeBudget(budget);
        return res.status(200).json({ data });
    } catch (error) {
        return buildErrorResponse(res, error);
    }
};

const deleteBudget = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;

        const deleted = await Budget.destroy({ where: { id, userId } });

        if (!deleted) {
            return res.status(404).json({ message: 'Orçamento não encontrado.' });
        }

        return res.status(204).end();
    } catch (error) {
        return buildErrorResponse(res, error);
    }
};

const listCategories = async (req, res) => {
    try {
        const userId = req.user?.id;
        const CategoryModel = getCategoryModel();

        const categories = await CategoryModel.findAll({
            where: { ownerId: userId },
            order: [['name', 'ASC']]
        });

        const data = Array.isArray(categories)
            ? categories.map(sanitizeCategory).filter(Boolean)
            : [];

        return res.status(200).json({ data });
    } catch (error) {
        return buildErrorResponse(res, error);
    }
};

const createCategory = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { name, slug, color, isActive = true } = req.body || {};

        const created = await FinanceCategory.create({
            name,
            slug,
            color,
            isActive: Boolean(isActive),
            ownerId: userId
        });

        const data = sanitizeCategory(created);
        return res.status(201).json({ data });
    } catch (error) {
        return buildErrorResponse(res, error);
    }
};

const updateCategory = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        const { name, slug, color, isActive } = req.body || {};

        const CategoryModel = getCategoryModel();
        const category = await CategoryModel.findOne({ where: { id, ownerId: userId } });

        if (!category) {
            return res.status(404).json({ message: 'Categoria não encontrada.' });
        }

        if (name !== undefined) {
            category.name = name;
        }
        if (slug !== undefined) {
            category.slug = slug;
        }
        if (color !== undefined) {
            category.color = color;
        }
        if (isActive !== undefined) {
            category.isActive = Boolean(isActive);
        }

        await category.save();

        const data = sanitizeCategory(category);
        return res.status(200).json({ data });
    } catch (error) {
        return buildErrorResponse(res, error);
    }
};

const deleteCategory = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;

        const CategoryModel = getCategoryModel();
        const category = await CategoryModel.findOne({ where: { id, ownerId: userId } });

        if (!category) {
            return res.status(404).json({ message: 'Categoria não encontrada.' });
        }

        category.isActive = false;
        await category.save();

        return res.status(204).end();
    } catch (error) {
        return buildErrorResponse(res, error);
    }
};

module.exports = {
    listBudgets,
    createBudget,
    updateBudget,
    deleteBudget,
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory
};

