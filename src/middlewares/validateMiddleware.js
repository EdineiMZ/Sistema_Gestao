// src/middlewares/validateMiddleware.js

const { check, validationResult } = require('express-validator');

/**
 * Validação para registro de usuário
 * Exige:
 * - Nome (mín. 3 chars)
 * - E-mail válido
 * - Senha (mín. 6 chars)
 */
exports.validateRegister = [
    check('name')
        .trim()
        .notEmpty().withMessage('Nome é obrigatório.')
        .isLength({ min: 3 }).withMessage('Nome deve ter ao menos 3 caracteres.'),

    check('email')
        .trim()
        .isEmail().withMessage('E-mail inválido.'),

    check('password')
        .notEmpty().withMessage('Senha é obrigatória.')
        .isLength({ min: 6 }).withMessage('Senha deve ter ao menos 6 caracteres.'),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            errors.array().forEach(err => req.flash('error_msg', err.msg));
            return res.redirect('/register');
        }
        next();
    }
];


/**
 * Validação para cadastro/edição de Procedimento
 * Ajuste conforme os campos que você deseja validar
 */
exports.validateProcedure = [
    check('name')
        .trim()
        .notEmpty().withMessage('Nome do procedimento é obrigatório.')
        .isLength({ min: 2 }).withMessage('Nome deve ter ao menos 2 caracteres.'),

    check('price')
        .notEmpty().withMessage('Preço é obrigatório.')
        .isFloat({ gt: 0 }).withMessage('Preço deve ser maior que zero.'),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            errors.array().forEach(err => req.flash('error_msg', err.msg));
            return res.redirect('/procedures/create');
        }
        next();
    }
];
