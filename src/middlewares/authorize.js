const { USER_ROLES, parseRole, roleAtLeast, sortRolesByHierarchy } = require('../constants/roles');

const normalizeRequirement = (requirement) => {
    if (Array.isArray(requirement)) {
        const allowedRoles = sortRolesByHierarchy(requirement);
        if (allowedRoles.length) {
            return { strategy: 'allow', roles: allowedRoles };
        }
        return { strategy: 'min', minimum: USER_ROLES.CLIENT };
    }

    if (requirement && typeof requirement === 'object') {
        const { allow, min, minimum, atLeast } = requirement;
        if (allow) {
            const allowedRoles = sortRolesByHierarchy(Array.isArray(allow) ? allow : [allow]);
            if (allowedRoles.length) {
                return { strategy: 'allow', roles: allowedRoles };
            }
        }
        const resolvedMinimum = parseRole(min ?? minimum ?? atLeast, USER_ROLES.CLIENT) || USER_ROLES.CLIENT;
        return { strategy: 'min', minimum: resolvedMinimum };
    }

    const minimumRole = parseRole(requirement, USER_ROLES.CLIENT) || USER_ROLES.CLIENT;
    return { strategy: 'min', minimum: minimumRole };
};

module.exports = (requirement = USER_ROLES.CLIENT) => {
    const config = normalizeRequirement(requirement);

    return (req, res, next) => {
        const user = req.user && req.user.active
            ? req.user
            : (req.session.user && req.session.user.active ? req.session.user : null);
        if (!user) {
            req.flash('error_msg', 'Você precisa estar logado para acessar esta página.');
            return res.redirect('/login');
        }

        if (!req.user) {
            req.user = user;
        }

        const userRole = parseRole(user.role, null);
        if (!userRole) {
            req.flash('error_msg', 'Não foi possível determinar suas permissões.');
            return res.redirect('/');
        }

        let allowed = false;
        if (config.strategy === 'allow') {
            allowed = config.roles.includes(userRole);
        } else {
            allowed = roleAtLeast(userRole, config.minimum);
        }

        if (allowed) {
            return next();
        }

        req.flash('error_msg', 'Você não tem permissão para acessar esta página.');
        return res.redirect('/');
    };
};
