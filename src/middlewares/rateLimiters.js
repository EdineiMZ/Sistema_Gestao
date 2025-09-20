const rateLimit = require('express-rate-limit');

const STATIC_ASSET_REGEX = /\.(?:css|js|mjs|json|png|jpe?g|gif|svg|ico|woff2?|ttf|map)$/i;

const isStaticAssetRequest = (req) => {
    if (req.method !== 'GET') {
        return false;
    }

    const requestPath = req.path || '';
    return STATIC_ASSET_REGEX.test(requestPath);
};

const isSocketHandshake = (req) => {
    const originalUrl = req.originalUrl || '';
    return originalUrl.startsWith('/socket.io');
};

const isTestUtilityRoute = (req) => {
    const requestPath = req.path || '';
    return requestPath.startsWith('/__test');
};

const createGeneralRateLimiter = () => rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Limite de requisições temporariamente excedido. Tente novamente em instantes.',
    skip: (req) => {
        if (isTestUtilityRoute(req)) {
            return true;
        }

        if (isStaticAssetRequest(req)) {
            return true;
        }

        if (isSocketHandshake(req)) {
            return true;
        }

        return Boolean(req.session && req.session.user);
    }
});

const createLoginRateLimiter = () => rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        res.status(options.statusCode).json({
            message: 'Muitas tentativas de login detectadas. Aguarde alguns minutos antes de tentar novamente.'
        });
    }
});

const generalRateLimiter = createGeneralRateLimiter();
const loginRateLimiter = createLoginRateLimiter();

const __testing = {
    createGeneralRateLimiter,
    createLoginRateLimiter,
    isStaticAssetRequest,
    isSocketHandshake,
    isTestUtilityRoute
};

module.exports = {
    generalRateLimiter,
    loginRateLimiter,
    createGeneralRateLimiter,
    createLoginRateLimiter,
    __testing
};
