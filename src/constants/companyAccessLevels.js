const COMPANY_ACCESS_LEVELS = Object.freeze({
    OWNER: 'owner',
    ADMIN: 'admin',
    MANAGER: 'manager',
    STAFF: 'staff',
    VIEWER: 'viewer'
});

const COMPANY_ACCESS_LEVEL_LABELS = Object.freeze({
    [COMPANY_ACCESS_LEVELS.OWNER]: 'Proprietário(a)',
    [COMPANY_ACCESS_LEVELS.ADMIN]: 'Administrador(a)',
    [COMPANY_ACCESS_LEVELS.MANAGER]: 'Gestor(a)',
    [COMPANY_ACCESS_LEVELS.STAFF]: 'Colaborador(a)',
    [COMPANY_ACCESS_LEVELS.VIEWER]: 'Visualizador(a)'
});

const COMPANY_ACCESS_LEVEL_ORDER = Object.freeze([
    COMPANY_ACCESS_LEVELS.OWNER,
    COMPANY_ACCESS_LEVELS.ADMIN,
    COMPANY_ACCESS_LEVELS.MANAGER,
    COMPANY_ACCESS_LEVELS.STAFF,
    COMPANY_ACCESS_LEVELS.VIEWER
]);

const DEFAULT_COMPANY_ACCESS_LEVEL = COMPANY_ACCESS_LEVELS.STAFF;

const isValidCompanyAccessLevel = (value) => COMPANY_ACCESS_LEVEL_ORDER.includes(value);

const normalizeCompanyAccessLevel = (value, fallback = DEFAULT_COMPANY_ACCESS_LEVEL) => {
    if (!value && value !== 0) {
        return fallback;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        const match = COMPANY_ACCESS_LEVEL_ORDER.find((level) => level === normalized);
        if (match) {
            return match;
        }
    }

    if (typeof value === 'number' && Number.isInteger(value)) {
        return COMPANY_ACCESS_LEVEL_ORDER[value] || fallback;
    }

    return fallback;
};

const getCompanyAccessLevelLabel = (value) => {
    if (!value) {
        return COMPANY_ACCESS_LEVEL_LABELS[DEFAULT_COMPANY_ACCESS_LEVEL];
    }

    const normalized = normalizeCompanyAccessLevel(value, null);
    if (!normalized) {
        return COMPANY_ACCESS_LEVEL_LABELS[DEFAULT_COMPANY_ACCESS_LEVEL];
    }

    return COMPANY_ACCESS_LEVEL_LABELS[normalized] || COMPANY_ACCESS_LEVEL_LABELS[DEFAULT_COMPANY_ACCESS_LEVEL];
};

const buildCompanyAccessLevelOptions = () =>
    COMPANY_ACCESS_LEVEL_ORDER.map((level) => ({
        value: level,
        label: COMPANY_ACCESS_LEVEL_LABELS[level]
    }));

module.exports = {
    COMPANY_ACCESS_LEVELS,
    COMPANY_ACCESS_LEVEL_LABELS,
    COMPANY_ACCESS_LEVEL_ORDER,
    DEFAULT_COMPANY_ACCESS_LEVEL,
    isValidCompanyAccessLevel,
    normalizeCompanyAccessLevel,
    getCompanyAccessLevelLabel,
    buildCompanyAccessLevelOptions
};
