const { body, param, query, validationResult } = require('express-validator');
const { PAYMENT_METHOD_VALUES } = require('../constants/pos');

const normalizeNumber = (value) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    if (typeof value === 'number') {
        return value;
    }

    const normalized = String(value).trim().replace(/\s+/g, '');
    const sanitized = normalized.replace(',', '.');
    const parsed = Number.parseFloat(sanitized);
    return Number.isFinite(parsed) ? parsed : null;
};

const validationErrorHandler = (req, res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) {
        return next();
    }

    const formatted = errors.array().map((error) => ({
        field: error.param,
        message: error.msg
    }));

    return res.status(422).json({
        message: 'Alguns dados fornecidos são inválidos.',
        errors: formatted
    });
};

const saleIdParam = param('saleId')
    .isInt({ min: 1 })
    .withMessage('Identificador de venda inválido.')
    .toInt();

const openSaleValidation = [
    body('customerName')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 160 })
        .withMessage('Nome do cliente deve ter até 160 caracteres.'),
    body('customerTaxId')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 32 })
        .withMessage('Documento do cliente deve ter até 32 caracteres.'),
    body('customerEmail')
        .optional({ checkFalsy: true })
        .trim()
        .isEmail()
        .withMessage('E-mail do cliente inválido.')
        .isLength({ max: 160 })
        .withMessage('E-mail do cliente deve ter até 160 caracteres.'),
    body('notes')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 500 })
        .withMessage('Observações devem ter até 500 caracteres.'),
    validationErrorHandler
];

const addItemValidation = [
    saleIdParam,
    body('productId')
        .isInt({ min: 1 })
        .withMessage('Produto inválido.')
        .toInt(),
    body('quantity')
        .custom((value) => {
            const parsed = normalizeNumber(value);
            if (!parsed || parsed <= 0) {
                throw new Error('Quantidade deve ser maior que zero.');
            }
            return true;
        }),
    body('unitPrice')
        .optional({ checkFalsy: true })
        .custom((value) => {
            const parsed = normalizeNumber(value);
            if (parsed === null) {
                throw new Error('Preço unitário inválido.');
            }
            if (parsed < 0) {
                throw new Error('Preço unitário não pode ser negativo.');
            }
            return true;
        }),
    body('discountValue')
        .optional({ checkFalsy: true })
        .custom((value) => {
            const parsed = normalizeNumber(value);
            if (parsed === null || parsed < 0) {
                throw new Error('Desconto inválido.');
            }
            return true;
        }),
    body('taxValue')
        .optional({ checkFalsy: true })
        .custom((value) => {
            const parsed = normalizeNumber(value);
            if (parsed === null || parsed < 0) {
                throw new Error('Tributo inválido.');
            }
            return true;
        }),
    validationErrorHandler
];

const addPaymentValidation = [
    saleIdParam,
    body('method')
        .isString()
        .withMessage('Método de pagamento é obrigatório.')
        .custom((value) => {
            const normalized = String(value).trim().toLowerCase();
            if (!PAYMENT_METHOD_VALUES.includes(normalized)) {
                throw new Error('Método de pagamento não suportado.');
            }
            return true;
        })
        .customSanitizer((value) => String(value).trim().toLowerCase()),
    body('amount')
        .custom((value) => {
            const parsed = normalizeNumber(value);
            if (!parsed || parsed <= 0) {
                throw new Error('Valor do pagamento deve ser maior que zero.');
            }
            return true;
        }),
    body('transactionReference')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 120 })
        .withMessage('Referência do pagamento deve ter até 120 caracteres.'),
    validationErrorHandler
];

const finalizeSaleValidation = [saleIdParam, validationErrorHandler];

const productSearchValidation = [
    query('q')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 120 })
        .withMessage('Busca deve ter até 120 caracteres.'),
    query('limit')
        .optional({ checkFalsy: true })
        .isInt({ min: 1, max: 50 })
        .withMessage('Limite de resultados inválido.')
        .toInt(),
    validationErrorHandler
];

module.exports = {
    openSaleValidation,
    addItemValidation,
    addPaymentValidation,
    finalizeSaleValidation,
    productSearchValidation
};
