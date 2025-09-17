'use strict';

const FALLBACK_THRESHOLD_PRESET = Object.freeze([0.5, 0.75, 0.9]);

const parseBoolean = (value, fallback = false) => {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number') {
        if (value === 1) {
            return true;
        }
        if (value === 0) {
            return false;
        }
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (!normalized) {
            return fallback;
        }
        if (['1', 'true', 'yes', 'on', 'enabled', 'enable'].includes(normalized)) {
            return true;
        }
        if (['0', 'false', 'no', 'off', 'disabled', 'disable'].includes(normalized)) {
            return false;
        }
    }

    return fallback;
};

const parseNumberList = (value, fallbackList = []) => {
    const fallback = Array.isArray(fallbackList)
        ? fallbackList
            .map((item) => {
                const numeric = Number.parseFloat(item);
                if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1) {
                    return null;
                }
                return Number(numeric.toFixed(4));
            })
            .filter((item) => item !== null)
        : [];

    if (value === null || value === undefined || value === '') {
        return [...fallback];
    }

    const rawList = Array.isArray(value)
        ? value
        : String(value)
            .split(/[,;\s]+/)
            .filter(Boolean);

    const normalized = rawList
        .map((item) => {
            if (item === null || item === undefined) {
                return null;
            }
            const raw = typeof item === 'string' ? item.trim() : String(item).trim();
            if (!raw) {
                return null;
            }
            const sanitized = raw.replace(',', '.');
            const numeric = Number.parseFloat(sanitized);
            if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1) {
                return null;
            }
            return Number(numeric.toFixed(4));
        })
        .filter((item) => item !== null);

    if (!normalized.length) {
        return [...fallback];
    }

    const unique = Array.from(new Set(normalized));
    unique.sort((a, b) => a - b);
    return unique;
};

const parseStringList = (value, fallbackList = []) => {
    if (value === null || value === undefined || value === '') {
        return [...fallbackList];
    }

    const rawList = Array.isArray(value)
        ? value
        : String(value)
            .split(/[,;\n]+/)
            .map((item) => item.trim())
            .filter(Boolean);

    const normalized = rawList
        .map((item) => (typeof item === 'string' ? item.trim() : String(item).trim()))
        .filter(Boolean);

    if (!normalized.length) {
        return [...fallbackList];
    }

    const unique = Array.from(new Set(normalized.map((item) => item.toLowerCase() === item ? item : item.trim())));
    return unique;
};

const budgetAlertEnabled = parseBoolean(process.env.BUDGET_ALERT_ENABLED, true);
const configuredThresholds = parseNumberList(
    process.env.BUDGET_THRESHOLD_DEFAULTS,
    budgetAlertEnabled ? FALLBACK_THRESHOLD_PRESET : []
);
const budgetAlertChannels = parseStringList(
    process.env.BUDGET_ALERT_CHANNELS,
    budgetAlertEnabled ? ['email'] : []
);
const budgetAlertRecipients = parseStringList(process.env.BUDGET_ALERT_RECIPIENTS, []);

const config = {
    budget: {
        thresholds: configuredThresholds,
        alert: {
            enabled: budgetAlertEnabled,
            channels: budgetAlertChannels,
            recipients: budgetAlertRecipients
        }
    }
};

const cloneList = (list) => (Array.isArray(list) ? list.map((item) => item) : []);

const getBudgetThresholdDefaults = () => cloneList(config.budget.thresholds);
const isBudgetAlertEnabled = () => config.budget.alert.enabled === true;
const getBudgetAlertChannels = () => cloneList(config.budget.alert.channels);
const getBudgetAlertRecipients = () => cloneList(config.budget.alert.recipients);

module.exports = {
    budget: {
        thresholds: getBudgetThresholdDefaults(),
        alert: {
            enabled: isBudgetAlertEnabled(),
            channels: getBudgetAlertChannels(),
            recipients: getBudgetAlertRecipients()
        }
    },
    getBudgetThresholdDefaults,
    isBudgetAlertEnabled,
    getBudgetAlertChannels,
    getBudgetAlertRecipients
};
