const { BudgetThresholdStatus } = require('../../database/models');

const normalizeMonthValue = (value) => {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        const normalized = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
        return normalized.toISOString().slice(0, 10);
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }

        if (/^\d{4}-\d{2}$/.test(trimmed)) {
            const normalized = new Date(`${trimmed}-01T00:00:00Z`);
            return normalizeMonthValue(normalized);
        }

        const parsed = new Date(trimmed);
        return Number.isNaN(parsed.getTime()) ? null : normalizeMonthValue(parsed);
    }

    if (typeof value === 'number') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : normalizeMonthValue(parsed);
    }

    return null;
};

const normalizeThresholdValue = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return null;
    }

    return Number(numeric.toFixed(2)).toFixed(2);
};

const resolveDateValue = (value) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
    }

    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }

    return new Date();
};

const isUniqueConstraintError = (error) => {
    if (!error) {
        return false;
    }

    if (error.name === 'SequelizeUniqueConstraintError' || error.name === 'UniqueConstraintError') {
        return true;
    }

    const message = String(error.message || '').toLowerCase();
    if (message.includes('unique constraint') || message.includes('unique violation')) {
        return true;
    }

    const code = (error.original && (error.original.code || error.original.errno))
        || error.code
        || error.errno;
    if (code && String(code).toLowerCase().includes('constraint')) {
        return true;
    }

    return false;
};

const getModel = () => {
    if (!BudgetThresholdStatus) {
        return null;
    }

    const hasPersistence = typeof BudgetThresholdStatus.findOrCreate === 'function'
        && typeof BudgetThresholdStatus.findOne === 'function';

    return hasPersistence ? BudgetThresholdStatus : null;
};

const registerBudgetAlertTrigger = async (payload = {}, options = {}) => {
    const model = getModel();
    const budgetId = Number(payload.budgetId) || null;
    const referenceMonth = normalizeMonthValue(payload.referenceMonth);
    const threshold = normalizeThresholdValue(payload.threshold);

    if (!budgetId || !referenceMonth || !threshold) {
        return {
            shouldDispatch: false,
            created: false,
            record: null,
            reason: 'invalid-input'
        };
    }

    if (!model) {
        return {
            shouldDispatch: true,
            created: false,
            record: null,
            reason: 'missing-model',
            referenceMonth,
            threshold
        };
    }

    const transaction = options.transaction || null;
    const now = resolveDateValue(options.triggeredAt || options.now || payload.triggeredAt);

    try {
        const [record, created] = await model.findOrCreate({
            where: {
                budgetId,
                referenceMonth,
                threshold
            },
            defaults: {
                triggeredAt: now
            },
            transaction
        });

        if (created) {
            return {
                shouldDispatch: true,
                created: true,
                record,
                referenceMonth,
                threshold
            };
        }

        if (options.updateOnDuplicate !== false) {
            await record.update({ triggeredAt: now }, { transaction });
        }

        return {
            shouldDispatch: false,
            created: false,
            record,
            referenceMonth,
            threshold
        };
    } catch (error) {
        if (isUniqueConstraintError(error)) {
            const existing = await model.findOne({
                where: {
                    budgetId,
                    referenceMonth,
                    threshold
                },
                transaction
            });

            if (existing && options.updateOnDuplicate !== false) {
                await existing.update({ triggeredAt: now }, { transaction });
            }

            return {
                shouldDispatch: false,
                created: false,
                record: existing,
                referenceMonth,
                threshold
            };
        }

        if (options.logger && typeof options.logger.error === 'function') {
            options.logger.error('Erro ao registrar disparo de alerta de orçamento:', error);
        }

        return {
            shouldDispatch: true,
            created: false,
            record: null,
            referenceMonth,
            threshold,
            error
        };
    }
};

module.exports = {
    registerBudgetAlertTrigger,
    normalizeMonthValue,
    normalizeThresholdValue,
    _internal: {
        getModel,
        resolveDateValue,
        isUniqueConstraintError
    }
};
