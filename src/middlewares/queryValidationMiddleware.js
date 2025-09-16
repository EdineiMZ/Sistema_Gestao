const { query, validationResult } = require('express-validator');

const createFilterValidation = ({ allowedStatuses = [], redirectTo, maxKeywordLength = 120 } = {}) => {
    const normalizedStatuses = allowedStatuses
        .map((status) => String(status).trim().toLowerCase())
        .filter((status) => status.length > 0);

    return [
        query('status')
            .optional({ checkFalsy: true })
            .bail()
            .custom((value) => {
                const normalized = String(value).trim().toLowerCase();
                if (!normalized) {
                    return true;
                }
                if (normalized === 'all') {
                    return true;
                }
                if (!normalizedStatuses.length) {
                    return true;
                }
                if (normalizedStatuses.includes(normalized)) {
                    return true;
                }
                throw new Error('Status inválido.');
            }),
        query('startDate')
            .optional({ checkFalsy: true })
            .isISO8601()
            .withMessage('Data inicial inválida.'),
        query('endDate')
            .optional({ checkFalsy: true })
            .isISO8601()
            .withMessage('Data final inválida.'),
        query('keyword')
            .optional({ checkFalsy: true })
            .trim()
            .isLength({ max: maxKeywordLength })
            .withMessage('Palavra-chave muito longa.'),
        (req, res, next) => {
            const errors = validationResult(req);
            if (errors.isEmpty()) {
                return next();
            }

            const basePath = redirectTo || `${req.baseUrl}${req.path}`;
            const messages = errors
                .array()
                .map((error) => error.msg)
                .filter(Boolean);
            const feedback = messages.length ? messages.join(' ') : 'Parâmetros de filtro inválidos.';

            if (req.accepts('json')) {
                return res.status(400).json({ errors: errors.array() });
            }

            if (typeof req.flash === 'function') {
                req.flash('error_msg', feedback);
            }

            return res.redirect(basePath);
        }
    ];
};

module.exports = {
    createFilterValidation
};
