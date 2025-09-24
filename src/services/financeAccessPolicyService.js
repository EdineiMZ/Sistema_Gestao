const { FinanceAccessPolicy } = require('../../database/models');
const {
    USER_ROLES,
    parseRole,
    sortRolesByHierarchy,
    roleAtLeast
} = require('../constants/roles');

const INTERNAL_MINIMUM_ROLE = USER_ROLES.MANAGER;

const DEFAULT_ALLOWED_ROLES = sortRolesByHierarchy([
    USER_ROLES.MANAGER,
    USER_ROLES.ADMIN
]);
const POLICY_KEY = FinanceAccessPolicy?.DEFAULT_POLICY_KEY || 'finance_access';

let cachedPolicy = null;
let loadingPromise = null;

const toArray = (value) => {
    if (Array.isArray(value)) {
        return value;
    }

    if (value === undefined || value === null) {
        return [];
    }

    if (typeof value === 'string') {
        const normalized = value.trim();
        if (!normalized) {
            return [];
        }

        try {
            const parsed = JSON.parse(normalized);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return normalized
                .split(/[,;|\s]+/)
                .map((token) => token.trim())
                .filter(Boolean);
        }
    }

    return [];
};

const sanitizeRoles = (roles) => sortRolesByHierarchy(
    toArray(roles).map((role) => parseRole(role)).filter(Boolean)
);

const filterInternalRoles = (roles) =>
    sanitizeRoles(roles).filter((role) => roleAtLeast(role, INTERNAL_MINIMUM_ROLE));

const resolveEnvFallbackRoles = () => {
    const envValue = process.env.FINANCE_ALLOWED_ROLES;
    const resolved = filterInternalRoles(envValue);
    if (resolved.length) {
        return resolved;
    }

    if (DEFAULT_ALLOWED_ROLES.length) {
        return [...DEFAULT_ALLOWED_ROLES];
    }

    const error = new Error('Finance allowed roles fallback is not properly configured.');
    error.code = 'FINANCE_FALLBACK_MISCONFIGURED';
    throw error;
};

const buildPolicy = ({
    allowedRoles,
    source,
    fallbackApplied,
    updatedAt = null,
    updatedById = null,
    updatedByName = null
}) => ({
    allowedRoles,
    source,
    fallbackApplied,
    updatedAt,
    updatedById,
    updatedByName
});

const isMissingTableError = (error) => {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const parent = error.parent || error.original || {};
    const code = parent.code || error.code;
    const message = String(parent.message || error.message || '').toLowerCase();

    if (message.includes('no such table') || message.includes('does not exist')) {
        return true;
    }

    if (code === '42P01') {
        return true;
    }

    return false;
};

const buildEnvFallbackPolicy = () => {
    const fallback = resolveEnvFallbackRoles();
    return buildPolicy({
        allowedRoles: fallback,
        source: 'env',
        fallbackApplied: true
    });
};

const fetchPolicyFromDatabase = async () => {
    if (!FinanceAccessPolicy || typeof FinanceAccessPolicy.findOne !== 'function') {
        return buildEnvFallbackPolicy();
    }

    let record;
    try {
        record = await FinanceAccessPolicy.findOne({
            where: { policyKey: POLICY_KEY },
            order: [['updatedAt', 'DESC']]
        });
    } catch (error) {
        if (isMissingTableError(error)) {
            return buildEnvFallbackPolicy();
        }
        throw error;
    }

    if (!record) {
        return buildEnvFallbackPolicy();
    }

    const plain = typeof record.get === 'function' ? record.get({ plain: true }) : record;
    const normalized = sanitizeRoles(plain.allowedRoles);
    const fallback = resolveEnvFallbackRoles();
    const usesFallback = normalized.length === 0;

    return buildPolicy({
        allowedRoles: usesFallback ? fallback : normalized,
        source: usesFallback ? 'env' : 'database',
        fallbackApplied: usesFallback,
        updatedAt: plain.updatedAt ? new Date(plain.updatedAt) : null,
        updatedById: plain.updatedById ?? null,
        updatedByName: plain.updatedByName ?? null
    });
};

const loadPolicy = async ({ force } = {}) => {
    if (!force && cachedPolicy) {
        return cachedPolicy;
    }

    if (!loadingPromise) {
        loadingPromise = fetchPolicyFromDatabase()
            .then((policy) => {
                cachedPolicy = policy;
                return policy;
            })
            .catch((error) => {
                if (isMissingTableError(error)) {
                    const fallbackPolicy = buildEnvFallbackPolicy();
                    cachedPolicy = fallbackPolicy;
                    return fallbackPolicy;
                }
                throw error;
            })
            .finally(() => {
                loadingPromise = null;
            });
    }

    return loadingPromise;
};

const getFinanceAccessPolicy = async () => {
    const policy = await loadPolicy({ force: false });
    return buildPolicy({
        ...policy,
        allowedRoles: [...policy.allowedRoles]
    });
};

const getAllowedRoles = async () => {
    const policy = await loadPolicy({ force: false });
    return [...policy.allowedRoles];
};

const invalidateCache = () => {
    cachedPolicy = null;
};

const saveFinanceAccessPolicy = async ({ allowedRoles, updatedBy } = {}) => {
    if (!FinanceAccessPolicy || typeof FinanceAccessPolicy.upsert !== 'function') {
        throw new Error('FinanceAccessPolicy model is not available.');
    }

    const sanitized = sanitizeRoles(allowedRoles);
    const fallback = resolveEnvFallbackRoles();
    const resolvedRoles = sanitized.length ? sanitized : fallback;
    const payload = {
        policyKey: POLICY_KEY,
        allowedRoles: resolvedRoles,
        updatedById: updatedBy?.id ?? null,
        updatedByName: updatedBy?.name ?? null
    };

    await FinanceAccessPolicy.upsert(payload);
    invalidateCache();
    const policy = await loadPolicy({ force: true });
    return buildPolicy({
        ...policy,
        allowedRoles: [...policy.allowedRoles]
    });
};

module.exports = {
    getFinanceAccessPolicy,
    getAllowedRoles,
    saveFinanceAccessPolicy,
    invalidateCache,
    resolveEnvFallbackRoles
};
