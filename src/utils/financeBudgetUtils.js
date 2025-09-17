const { Budget } = require('../../database/models');

const BUDGET_THRESHOLD_ERROR = 'BudgetThresholdValidationError';

const coerceThresholdInput = (value) => {
    if (Array.isArray(value)) {
        return value;
    }

    if (value === undefined || value === null) {
        return [];
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return [];
        }

        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        } catch (error) {
            // Ignore JSON parse errors and fallback to splitting by separators
        }

        return trimmed
            .split(/[;,\s]+/)
            .map((item) => item.trim())
            .filter((item) => item.length);
    }

    return [value];
};

const buildValidationError = (message) => {
    const error = new Error(message);
    error.name = BUDGET_THRESHOLD_ERROR;
    error.statusCode = 400;
    return error;
};

const validateThresholdList = (value) => {
    const coalesced = coerceThresholdInput(value);
    const normalizer = Budget && typeof Budget.normalizeThresholds === 'function'
        ? Budget.normalizeThresholds.bind(Budget)
        : (list) => (Array.isArray(list) ? list : []);

    const normalized = normalizer(coalesced);

    if (!Array.isArray(normalized) || normalized.length === 0) {
        throw buildValidationError('Informe ao menos um limite de alerta entre 0 e 1.');
    }

    const outOfRange = normalized.find((item) => item <= 0 || item >= 1);
    if (outOfRange !== undefined) {
        throw buildValidationError('Cada limite de alerta deve estar entre 0 e 1.');
    }

    return normalized;
};

module.exports = {
    validateThresholdList,
    BUDGET_THRESHOLD_ERROR
};
