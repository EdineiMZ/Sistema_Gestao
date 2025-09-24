const crypto = require('crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);
const TOKEN_SESSION_KEY = 'csrfToken';

const wantsJsonResponse = (req = {}) => {
    if (!req || typeof req !== 'object') {
        return false;
    }

    if (req.xhr) {
        return true;
    }

    const acceptHeader = typeof req.get === 'function' ? req.get('Accept') : (req.headers && req.headers.accept);
    if (typeof acceptHeader === 'string' && acceptHeader.toLowerCase().includes('json')) {
        return true;
    }

    if (req.query && (req.query.format === 'json' || req.query.format === 'JSON')) {
        return true;
    }

    return false;
};

const ensureCsrfToken = (req, res) => {
    if (!req || typeof req !== 'object' || !req.session) {
        return null;
    }

    let token = req.session[TOKEN_SESSION_KEY];
    if (typeof token !== 'string' || token.length < 32) {
        token = crypto.randomBytes(32).toString('hex');
        req.session[TOKEN_SESSION_KEY] = token;
    }

    if (typeof req.csrfToken !== 'function') {
        req.csrfToken = () => token;
    }

    if (res && res.locals) {
        res.locals.csrfToken = token;
    }

    return token;
};

const extractSubmittedToken = (req) => {
    if (!req || typeof req !== 'object') {
        return null;
    }

    const bodyToken = req.body && typeof req.body === 'object' ? req.body._csrf : null;
    if (typeof bodyToken === 'string' && bodyToken.trim()) {
        return bodyToken.trim();
    }

    const queryToken = req.query && typeof req.query === 'object' ? req.query._csrf : null;
    if (typeof queryToken === 'string' && queryToken.trim()) {
        return queryToken.trim();
    }

    const headerToken = typeof req.get === 'function'
        ? (req.get('x-csrf-token') || req.get('x-xsrf-token'))
        : (req.headers && (req.headers['x-csrf-token'] || req.headers['x-xsrf-token']));

    if (typeof headerToken === 'string' && headerToken.trim()) {
        return headerToken.trim();
    }

    return null;
};

const csrfProtection = (req, res, next) => {
    try {
        const token = ensureCsrfToken(req, res);
        if (!token) {
            const error = new Error('Não foi possível validar a proteção CSRF da sessão.');
            error.status = 403;
            throw error;
        }

        if (SAFE_METHODS.has((req.method || '').toUpperCase())) {
            return next();
        }

        const submittedToken = extractSubmittedToken(req);
        if (submittedToken) {
            const submittedBuffer = Buffer.from(submittedToken);
            const tokenBuffer = Buffer.from(token);

            if (submittedBuffer.length === tokenBuffer.length
                && crypto.timingSafeEqual(submittedBuffer, tokenBuffer)) {
                return next();
            }
        }

        if (wantsJsonResponse(req)) {
            return res.status(403).json({
                ok: false,
                message: 'Falha de segurança detectada. Atualize a página e tente novamente.'
            });
        }

        if (typeof req.flash === 'function') {
            req.flash('error_msg', 'Sua sessão expirou. Atualize a página e tente novamente.');
        }

        if (typeof res.redirect === 'function') {
            return res.redirect('back');
        }

        const error = new Error('Token CSRF inválido.');
        error.status = 403;
        return next(error);
    } catch (error) {
        return next(error);
    }
};

module.exports = csrfProtection;
module.exports.ensureCsrfToken = ensureCsrfToken;
module.exports.extractSubmittedToken = extractSubmittedToken;
