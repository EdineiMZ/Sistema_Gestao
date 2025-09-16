const USER_ROLES = Object.freeze({
    CLIENT: 'client',
    COLLABORATOR: 'collaborator',
    SPECIALIST: 'specialist',
    MANAGER: 'manager',
    ADMIN: 'admin'
});

const ROLE_ORDER = [
    USER_ROLES.CLIENT,
    USER_ROLES.COLLABORATOR,
    USER_ROLES.SPECIALIST,
    USER_ROLES.MANAGER,
    USER_ROLES.ADMIN
];

const ROLE_LABELS = Object.freeze({
    [USER_ROLES.CLIENT]: 'Cliente',
    [USER_ROLES.COLLABORATOR]: 'Colaborador',
    [USER_ROLES.SPECIALIST]: 'Especialista',
    [USER_ROLES.MANAGER]: 'Gestor',
    [USER_ROLES.ADMIN]: 'Administrador'
});

const normalizeRoleInput = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (ROLE_ORDER.includes(normalized)) {
            return normalized;
        }
        const numeric = Number.parseInt(normalized, 10);
        if (Number.isInteger(numeric)) {
            return normalizeRoleInput(numeric);
        }
        return null;
    }

    if (typeof value === 'number' && Number.isInteger(value)) {
        if (value >= 0 && value < ROLE_ORDER.length) {
            return ROLE_ORDER[value];
        }
        return null;
    }

    return null;
};

const parseRole = (value, fallback = null) => {
    const normalized = normalizeRoleInput(value);
    if (normalized) {
        return normalized;
    }
    return fallback;
};

const getRoleLevel = (role) => {
    if (!role) return -1;
    const normalized = typeof role === 'string' ? role.trim().toLowerCase() : normalizeRoleInput(role);
    if (!normalized) {
        return -1;
    }
    return ROLE_ORDER.indexOf(normalized);
};

const roleAtLeast = (role, minimumRole) => {
    const userLevel = getRoleLevel(role);
    const minimumLevel = getRoleLevel(minimumRole ?? USER_ROLES.CLIENT);
    if (userLevel === -1 || minimumLevel === -1) {
        return false;
    }
    return userLevel >= minimumLevel;
};

const sortRolesByHierarchy = (roles = []) => {
    return Array.from(new Set(
        roles
            .map((role) => parseRole(role))
            .filter(Boolean)
    )).sort((a, b) => getRoleLevel(a) - getRoleLevel(b));
};

module.exports = {
    USER_ROLES,
    ROLE_ORDER,
    ROLE_LABELS,
    parseRole,
    getRoleLevel,
    roleAtLeast,
    sortRolesByHierarchy
};
