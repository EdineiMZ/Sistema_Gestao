const { parseRole, getRoleLevel, USER_ROLES } = require('../constants/roles');

const ROLE_ALIASES = {
    admin: USER_ROLES.ADMIN,
    administrator: USER_ROLES.ADMIN,
    gestor: USER_ROLES.MANAGER,
    manager: USER_ROLES.MANAGER,
    especialista: USER_ROLES.SPECIALIST,
    specialist: USER_ROLES.SPECIALIST,
    colaborador: USER_ROLES.COLLABORATOR,
    collaborator: USER_ROLES.COLLABORATOR,
    staff: USER_ROLES.COLLABORATOR,
    cliente: USER_ROLES.CLIENT,
    client: USER_ROLES.CLIENT,
    user: USER_ROLES.CLIENT,
    usuario: USER_ROLES.CLIENT
};

const resolveRoleToken = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (!normalized) {
            return null;
        }

        if (Object.prototype.hasOwnProperty.call(ROLE_ALIASES, normalized)) {
            return ROLE_ALIASES[normalized];
        }
    }

    return parseRole(value, null);
};

const resolveRoleLevel = (value) => {
    const token = resolveRoleToken(value);
    if (token) {
        return getRoleLevel(token);
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const truncated = Math.trunc(value);
        return truncated >= 0 ? truncated : null;
    }

    return null;
};

module.exports = (allowedRoles = []) => {
    const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    const allowedLevels = new Set();

    rolesArray.forEach((role) => {
        const level = resolveRoleLevel(role);
        if (typeof level === 'number' && !Number.isNaN(level) && level >= 0) {
            allowedLevels.add(level);
        }
    });

    const highestAllowed = allowedLevels.size ? Math.max(...allowedLevels) : null;

    return (req, res, next) => {
        const user = (req.user && req.user.active !== undefined) ? req.user : req.session.user;

        if (!user || !user.active) {
            req.flash('error_msg', 'Você precisa estar autenticado para acessar esta área.');
            return res.redirect('/login');
        }

        if (!allowedLevels.size) {
            return next();
        }

        const userLevel = resolveRoleLevel(user.role);

        if (typeof userLevel !== 'number' || Number.isNaN(userLevel)) {
            req.flash('error_msg', 'Seu perfil de acesso é inválido. Faça login novamente.');
            if (req.session) {
                req.session.user = null;
            }
            return res.redirect('/login');
        }

        if (allowedLevels.has(userLevel) || (highestAllowed !== null && userLevel >= highestAllowed)) {
            return next();
        }

        if (req.xhr || (req.headers.accept || '').includes('application/json')) {
            return res.status(403).json({ message: 'Acesso negado.' });
        }

        req.flash('error_msg', 'Você não tem permissão para acessar este recurso.');

        return res.redirect('/');
    };
};
