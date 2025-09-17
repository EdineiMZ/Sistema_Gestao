const { FinanceCategory } = require('../../database/models');

const buildOwnerFilter = (ownerId) => {
    if (ownerId === undefined || ownerId === null) {
        return {};
    }
    return { ownerId };
};

const listCategories = async ({ ownerId } = {}) => {
    const where = buildOwnerFilter(ownerId);
    const query = {
        where,
        order: [['name', 'ASC']]
    };

    return FinanceCategory.scope('all').findAll(query);
};

const findCategoryById = async ({ id, ownerId }) => {
    const where = { id, ...buildOwnerFilter(ownerId) };
    return FinanceCategory.scope('all').findOne({ where });
};

const saveCategory = async ({ id, name, slug, color, isActive = true, ownerId = null }) => {
    if (id) {
        const category = await findCategoryById({ id, ownerId });
        if (!category) {
            const error = new Error('Categoria não encontrada.');
            error.code = 'CATEGORY_NOT_FOUND';
            throw error;
        }

        category.name = name;
        category.slug = slug;
        category.color = color;
        category.isActive = Boolean(isActive);
        category.ownerId = ownerId || null;

        await category.save();
        return category;
    }

    return FinanceCategory.create({
        name,
        slug,
        color,
        isActive: Boolean(isActive),
        ownerId: ownerId || null
    });
};

const deleteCategory = async ({ id, ownerId }) => {
    const category = await findCategoryById({ id, ownerId });
    if (!category) {
        const error = new Error('Categoria não encontrada.');
        error.code = 'CATEGORY_NOT_FOUND';
        throw error;
    }

    await category.destroy();
};

module.exports = {
    listCategories,
    saveCategory,
    deleteCategory
};
