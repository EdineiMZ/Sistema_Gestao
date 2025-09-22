// src/middlewares/permissionMiddleware.js
// Mantido por compatibilidade: utiliza o novo middleware authorize internamente
const authorize = require('./authorize');

module.exports = (requiredRole) => {
    if (typeof requiredRole === 'function') {
        return async (req, res, next) => {
            try {
                const resolvedRoles = await requiredRole(req, res, next);
                const middleware = authorize(resolvedRoles);
                return middleware(req, res, next);
            } catch (error) {
                console.error('Erro ao resolver permissões dinamicamente:', error);

                const acceptsJson = req.xhr || (req.headers && typeof req.headers.accept === 'string' && req.headers.accept.includes('application/json'));

                if (acceptsJson) {
                    return res.status(500).json({ message: 'Não foi possível validar permissões.' });
                }

                if (typeof req.flash === 'function') {
                    req.flash('error_msg', 'Não foi possível validar permissões. Tente novamente mais tarde.');
                }

                return res.redirect('/');
            }
        };
    }

    return authorize(requiredRole);
};
