const ROLE_LEVELS = {
    admin: 4,
    administrator: 4,
    gestor: 3,
    manager: 3,
    especialista: 2,
    specialist: 2,
    colaborador: 1,
    collaborator: 1,
    staff: 1,
    cliente: 0,
    client: 0,
    user: 0,
    usuario: 0
};

const normalizeRole = (role) => {
    if (typeof role === 'number' && Number.isFinite(role)) {
        return Math.trunc(role);
    }

    if (typeof role === 'string') {
        const trimmed = role.trim();
        if (trimmed === '') {
            return null;
        }

        const numericRole = Number.parseInt(trimmed, 10);
        if (!Number.isNaN(numericRole)) {
            return numericRole;
        }

        const normalized = trimmed.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(ROLE_LEVELS, normalized)) {
            return ROLE_LEVELS[normalized];
        }
    }

    return null;
};

module.exports = (allowedRoles = []) => {
    const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    const allowedLevels = new Set();

    rolesArray.forEach((role) => {
        const mapped = normalizeRole(role);
        if (mapped !== null && mapped !== undefined) {
            allowedLevels.add(mapped);
        }
    });

    const highestAllowed = allowedLevels.size ? Math.max(...allowedLevels) : null;

    return (req, res, next) => {
        const user = req.session.user;

        if (!user || !user.active) {
            req.flash('error_msg', 'Você precisa estar autenticado para acessar esta área.');
            return res.redirect('/login');
        }

        if (!allowedLevels.size) {
            return next();
        }

        if (allowedLevels.has(user.role) || (highestAllowed !== null && user.role > highestAllowed)) {
            return next();
        }

        if (req.xhr || (req.headers.accept || '').includes('application/json')) {
            return res.status(403).json({ message: 'Acesso negado.' });
        }

        req.flash('error_msg', 'Você não tem permissão para acessar este recurso.');
        return res.redirect('/');
    };
};
