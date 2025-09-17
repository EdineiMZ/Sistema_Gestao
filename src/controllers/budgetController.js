const budgetService = require('../services/budgetService');
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

const parsePositiveNumber = (value, errorMessage) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        throw new ValidationError(errorMessage || 'Valor deve ser maior que zero.');
    }

    return Number(numeric.toFixed(2));
};

const parseThresholds = (value) => {
    if (value === undefined || value === null || value === '') {
        return [];
    }

    const list = Array.isArray(value) ? value : String(value).split(',');
    const normalized = list
        .map((item) => {
            if (item === undefined || item === null || item === '') {
                return null;
            }

            const numeric = Number(item);
            if (!Number.isFinite(numeric) || numeric <= 0) {
                throw new ValidationError('Cada limiar deve ser um número positivo.');
            }

            return Number(numeric.toFixed(2));
        })
        .filter((item) => item !== null);

    const uniqueValues = Array.from(new Set(normalized));
    uniqueValues.sort((a, b) => a - b);

    return uniqueValues;
};

const parseReferenceMonth = (value) => {
    if (!value) {
        return null;
    }

    const stringValue = typeof value === 'string' ? value.trim() : value;
    let reference;

    if (stringValue instanceof Date) {
        reference = stringValue;
    } else if (typeof stringValue === 'string') {
        if (/^\d{4}-\d{2}$/.test(stringValue)) {
            reference = new Date(`${stringValue}-01T00:00:00Z`);
        } else {
            reference = new Date(stringValue);
        }
    } else if (typeof stringValue === 'number') {
        reference = new Date(stringValue);
    }

    if (!(reference instanceof Date) || Number.isNaN(reference.getTime())) {
        throw new ValidationError('Mês de referência inválido. Utilize o formato YYYY-MM.');
    }

    return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1)).toISOString().slice(0, 10);
};

const parseIntegerId = (value, errorMessage) => {
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric <= 0) {
        throw new ValidationError(errorMessage || 'Identificador inválido.');
    }

    return numeric;
};

const extractUserId = (req) => req.user?.id || req.session?.user?.id;

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

    if (error?.code === 'BUDGET_NOT_FOUND') {
        return {
            status: 404,
            message: error.message || 'Orçamento não encontrado.'
        };
    }

    return {
        status: 500,
        message: 'Erro interno ao processar orçamento.'
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

const buildBudgetPayload = (body, userId) => {
    if (!userId) {
        throw new ValidationError('Usuário não identificado para vincular o orçamento.');
    }

    const financeCategoryId = parseIntegerId(body.financeCategoryId, 'Categoria financeira é obrigatória.');

    return {
        id: body.id ? parseIntegerId(body.id, 'Identificador do orçamento inválido.') : null,
        monthlyLimit: parsePositiveNumber(body.monthlyLimit, 'Limite mensal deve ser maior que zero.'),
        thresholds: parseThresholds(body.thresholds),
        referenceMonth: body.referenceMonth ? parseReferenceMonth(body.referenceMonth) : null,
        userId,
        financeCategoryId
    };
};

const budgetController = {
    list: async (req, res) => {
        try {
            const userId = extractUserId(req);
            const filters = {
                userId,
                financeCategoryId: req.query?.financeCategoryId ? parseIntegerId(req.query.financeCategoryId, 'Categoria financeira inválida.') : undefined
            };
            const budgets = await budgetService.listBudgets(filters);
            return sendSuccess(res, { data: budgets });
        } catch (error) {
            return handleError(res, error, 'Erro ao listar orçamentos.');
        }
    },

    save: async (req, res) => {
        try {
            const userId = extractUserId(req);
            const payload = buildBudgetPayload(req.body || {}, userId);
            const budget = await budgetService.saveBudget(payload);
            return sendSuccess(res, {
                status: payload.id ? 200 : 201,
                message: payload.id ? 'Orçamento atualizado com sucesso.' : 'Orçamento criado com sucesso.',
                data: budget
            });
        } catch (error) {
            return handleError(res, error, 'Erro ao salvar orçamento.');
        }
    },

    delete: async (req, res) => {
        try {
            const userId = extractUserId(req);
            const idValue = req.params?.id || req.body?.id;
            if (!idValue) {
                throw new ValidationError('Identificador do orçamento é obrigatório.');
            }

            const id = parseIntegerId(idValue, 'Identificador do orçamento inválido.');
            await budgetService.deleteBudget({ id, userId });
            return sendSuccess(res, { message: 'Orçamento removido com sucesso.' });
        } catch (error) {
            return handleError(res, error, 'Erro ao excluir orçamento.');
        }
    }
};

module.exports = budgetController;
