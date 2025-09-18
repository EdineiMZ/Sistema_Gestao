const { AuditLog } = require('../../database/models');

const resolveClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const [firstIp] = String(forwarded).split(',');
        if (firstIp) {
            return firstIp.trim();
        }
    }
    return (
        req.ip ||
        req.socket?.remoteAddress ||
        req.connection?.remoteAddress ||
        ''
    ).toString();
};

const resolveUserId = (req) => {
    if (req?.user && req.user.id !== undefined && req.user.id !== null) {
        return req.user.id;
    }

    if (req?.session?.user && req.session.user.id !== undefined && req.session.user.id !== null) {
        return req.session.user.id;
    }

    return null;
};

module.exports = (action, resource) => {
    if (!action) {
        throw new Error('Audit middleware requires an action identifier.');
    }

    return (req, res, next) => {
        const originalFlash = typeof req.flash === 'function' ? req.flash.bind(req) : null;
        let shouldLog = false;

        if (originalFlash) {
            req.flash = (...args) => {
                if (args.length > 1 && args[0] === 'success_msg' && args[1]) {
                    shouldLog = true;
                }
                return originalFlash(...args);
            };
        }

        res.on('finish', async () => {
            if (!shouldLog) {
                return;
            }

            if (res.statusCode >= 400) {
                return;
            }

            const resolvedResource = typeof resource === 'function'
                ? resource(req, res)
                : resource;

            try {
                if (!AuditLog) {
                    console.warn('AuditLog model is not available. Skipping audit log.');
                    return;
                }

                await AuditLog.create({
                    userId: resolveUserId(req),
                    action,
                    resource: resolvedResource || req.originalUrl,
                    ip: resolveClientIp(req)
                });
            } catch (error) {
                console.error('Erro ao registrar log de auditoria:', error);
            }
        });

        return next();
    };
};
