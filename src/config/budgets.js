'use strict';

const DEFAULT_THRESHOLD_FALLBACK = Object.freeze([0.5, 0.75, 0.9]);

const normalizeThresholdValue = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric)) {
        return null;
    }

    const rounded = Number(numeric.toFixed(4));
    if (rounded <= 0 || rounded > 1) {
        return null;
    }

    return Number(rounded.toFixed(2));
};

const normalizeThresholdList = (input) => {
    if (input === undefined || input === null) {
        return [];
    }

    const values = Array.isArray(input) ? input : String(input).split(',');

    const normalized = values
        .map(normalizeThresholdValue)
        .filter((value) => value !== null);

    if (!normalized.length) {
        return [];
    }

    const unique = Array.from(new Set(normalized));
    unique.sort((a, b) => a - b);
    return unique;
};

const resolvedDefaultThresholds = (() => {
    const fromEnv = normalizeThresholdList(process.env.BUDGET_DEFAULT_THRESHOLDS);
    return fromEnv.length ? fromEnv : [...DEFAULT_THRESHOLD_FALLBACK];
})();

const sanitizeBaseUrl = (value) => {
    if (typeof value !== 'string' || !value.trim()) {
        return '';
    }

    try {
        const url = new URL(value.trim());
        url.hash = '';
        return url.toString().replace(/\/$/, '');
    } catch (error) {
        return '';
    }
};

const APP_BASE_URL = sanitizeBaseUrl(process.env.APP_BASE_URL || process.env.APP_URL);

const sanitizePath = (value) => {
    if (typeof value !== 'string' || !value.trim()) {
        return '/finance/budgets';
    }

    const trimmed = value.trim();
    if (!trimmed.startsWith('/')) {
        return `/${trimmed.replace(/^\/+/, '')}`;
    }

    return trimmed.replace(/\/+/g, '/');
};

const BUDGETS_PAGE_PATH = sanitizePath(process.env.BUDGETS_PAGE_PATH || '/finance/budgets');

const buildBudgetLink = () => {
    if (APP_BASE_URL) {
        try {
            const url = new URL(BUDGETS_PAGE_PATH, APP_BASE_URL);
            url.hash = '';
            return url.toString();
        } catch (error) {
            return BUDGETS_PAGE_PATH;
        }
    }

    return BUDGETS_PAGE_PATH;
};

const getDefaultBudgetThresholds = () => [...resolvedDefaultThresholds];

module.exports = {
    getDefaultBudgetThresholds,
    normalizeThresholdList,
    buildBudgetLink,
    DEFAULT_BUDGET_ALERT_ACCENT: process.env.BUDGET_ALERT_ACCENT || '#2563eb'
};
