const financeCategoryService = require('../services/financeCategoryService');
const logger = require('../utils/logger');

class ValidationError extends Error {
    constructor(message, details) {
        super(message);
        this.name = 'ValidationError';
        this.statusCode = 400;
        this.details = Array.isArray(details) && details.length > 0 ? details : undefined;
    }
}

class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NotFoundError';
        this.statusCode = 404;
    }
}

const HEX_COLOR_REGEX = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const normalizeColor = (value) => {
    if (!value) {
        return '#6c757d';
    }

    const trimmed = String(value).trim();
    if (!HEX_COLOR_REGEX.test(trimmed)) {
        throw new ValidationError('Cor deve estar no formato hexadecimal (#RGB ou #RRGGBB).');
    }

    return trimmed.startsWith('#') ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`;
};

const normalizeSlug = (value) => {
    if (value === undefined || value === null) {
        throw new ValidationError('Slug é obrigatório.');
    }

    const normalized = String(value)
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    if (!normalized) {
        throw new ValidationError('Slug é obrigatório.');
    }

    return normalized;
};

const normalizeName = (value) => {
    if (!value) {
        throw new ValidationError('Nome da categoria é obrigatório.');
    }

    const name = String(value).trim();
    if (name.length < 2 || name.length > 120) {
        throw new ValidationError('Nome da categoria deve conter entre 2 e 120 caracteres.');
    }

    return name;
};

const normalizeIsActive = (value) => {
    if (value === undefined || value === null) {
        return true;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized)) {
            return true;
        }
        if (['false', '0', 'no', 'off'].includes(normalized)) {
            return false;
        }
    }

    return Boolean(value);
};

const normalizeId = (value) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric <= 0) {
        throw new ValidationError('Identificador inválido.');
    }

    return numeric;
};

const extractOwnerId = (req) => req.user?.id || req.session?.user?.id || null;

const sendSuccess = (res, { status = 200, message = 'Operação realizada com sucesso.', data = null }) => (
    res.status(status).json({ success: true, message, data })
);

const buildErrorResponse = (error) => {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
        return {
            status: error.statusCode,
            message: error.message,
            details: error.details
        };
    }

    if (error?.name === 'SequelizeValidationError' || error?.name === 'SequelizeUniqueConstraintError') {
        const details = (error.errors || []).map((err) => err.message).filter(Boolean);
        return {
            status: 400,
            message: details[0] || 'Erro de validação.',
            details: details.length > 1 ? details : undefined
        };
    }

    if (error?.code === 'CATEGORY_NOT_FOUND') {
        return {
            status: 404,
            message: error.message || 'Categoria não encontrada.'
        };
    }

    return {
        status: 500,
        message: 'Erro interno ao processar categoria.'
    };
};

const handleError = (res, error, contextMessage) => {
    const { status, message, details } = buildErrorResponse(error);

    if (status === 500) {
        logger.error(contextMessage, error);
    }

    const payload = { success: false, message };
    if (details) {
        payload.details = details;
    }

    return res.status(status).json(payload);
};

const buildCategoryPayload = (body, ownerId) => ({
    id: normalizeId(body.id),
    name: normalizeName(body.name),
    slug: normalizeSlug(body.slug),
    color: normalizeColor(body.color),
    isActive: normalizeIsActive(body.isActive),
    ownerId
});

const financeCategoryController = {
    list: async (req, res) => {
        try {
            const ownerId = extractOwnerId(req);
            const categories = await financeCategoryService.listCategories({ ownerId });
            return sendSuccess(res, { data: categories });
        } catch (error) {
            return handleError(res, error, 'Erro ao listar categorias financeiras');
        }
    },

    save: async (req, res) => {
        try {
            const ownerId = extractOwnerId(req);
            const payload = buildCategoryPayload(req.body || {}, ownerId);
            const category = await financeCategoryService.saveCategory(payload);
            return sendSuccess(res, {
                status: payload.id ? 200 : 201,
                message: payload.id ? 'Categoria atualizada com sucesso.' : 'Categoria criada com sucesso.',
                data: category
            });
        } catch (error) {
            return handleError(res, error, 'Erro ao salvar categoria financeira');
        }
    },

    delete: async (req, res) => {
        try {
            const ownerId = extractOwnerId(req);
            const id = normalizeId(req.params?.id || req.body?.id);
            if (!id) {
                throw new ValidationError('Identificador da categoria é obrigatório.');
            }

            await financeCategoryService.deleteCategory({ id, ownerId });
            return sendSuccess(res, { message: 'Categoria removida com sucesso.' });
        } catch (error) {
            return handleError(res, error, 'Erro ao excluir categoria financeira');
        }
    }
};

module.exports = financeCategoryController;
