'use strict';

const { body, validationResult } = require('express-validator');
const {
    PROMOTION_TYPES,
    PROMOTION_DISCOUNT_TYPES,
    listPromotions: listPromotionsService,
    createPromotion: createPromotionService,
    updatePromotion: updatePromotionService,
    deletePromotion: deletePromotionService,
    getPromotionById,
    getProductOptions
} = require('../services/promotionService');

const PROMOTION_TYPE_LABELS = {
    brand: 'Marca',
    category: 'Categoria',
    product: 'Produto específico',
    store: 'Loja inteira'
};

const PROMOTION_DISCOUNT_LABELS = {
    percentage: 'Percentual (%)',
    fixed: 'Valor fixo (R$)'
};

const STATUS_FILTER_OPTIONS = [
    { value: 'all', label: 'Todas' },
    { value: 'active', label: 'Ativas' }
];

const wantsJson = (req) => {
    const acceptHeader = (req.headers.accept || '').toLowerCase();
    const contentType = (req.headers['content-type'] || '').toLowerCase();
    return req.xhr || acceptHeader.includes('application/json') || contentType.includes('application/json');
};

const buildErrorMap = (errorsArray = []) => {
    return errorsArray.reduce((acc, error) => {
        const key = error.path || error.param || 'form';
        if (!acc[key]) {
            acc[key] = [];
        }

        const message = error.msg || error.message || error;
        if (message) {
            acc[key].push(message);
        }

        return acc;
    }, {});
};

const normalizeDateInput = (value) => {
    if (!value) {
        return '';
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toISOString().slice(0, 10);
};

const DEFAULT_FORM_STATE = {
    name: '',
    description: '',
    type: 'store',
    discountType: 'percentage',
    discountValue: '',
    targetBrand: '',
    targetCategory: '',
    targetProductId: '',
    startDate: '',
    endDate: '',
    isActive: true
};

const buildFormState = (promotion) => {
    if (!promotion) {
        return { ...DEFAULT_FORM_STATE };
    }

    return {
        ...DEFAULT_FORM_STATE,
        ...promotion,
        discountValue: promotion.discountValue ?? DEFAULT_FORM_STATE.discountValue,
        startDate: normalizeDateInput(promotion.startDate),
        endDate: normalizeDateInput(promotion.endDate),
        isActive: promotion.isActive !== undefined ? Boolean(promotion.isActive) : DEFAULT_FORM_STATE.isActive
    };
};

const promotionValidationRules = [
    body('name').trim().notEmpty().withMessage('Informe o nome da promoção.'),
    body('type').isIn(PROMOTION_TYPES).withMessage('Selecione um tipo de promoção válido.'),
    body('discountType').isIn(PROMOTION_DISCOUNT_TYPES).withMessage('Selecione um tipo de desconto válido.'),
    body('discountValue').trim().notEmpty().withMessage('Informe o valor de desconto.'),
    body('startDate')
        .optional({ checkFalsy: true })
        .isISO8601()
        .withMessage('Data inicial inválida.'),
    body('endDate')
        .optional({ checkFalsy: true })
        .isISO8601()
        .withMessage('Data final inválida.'),
    body('targetBrand').custom((value, { req }) => {
        if (req.body.type === 'brand') {
            if (!value || !String(value).trim()) {
                throw new Error('Informe a marca para aplicar a promoção.');
            }
        }
        return true;
    }),
    body('targetCategory').custom((value, { req }) => {
        if (req.body.type === 'category') {
            if (!value || !String(value).trim()) {
                throw new Error('Informe a categoria para aplicar a promoção.');
            }
        }
        return true;
    }),
    body('targetProductId').custom((value, { req }) => {
        if (req.body.type === 'product') {
            if (!value || !String(value).trim()) {
                throw new Error('Selecione o produto que receberá a promoção.');
            }
            const parsed = Number.parseInt(value, 10);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                throw new Error('Selecione um produto válido.');
            }
        }
        return true;
    })
];

const handleValidationFailure = async (req, res, errors, formState, productOptions, isEdit = false) => {
    const errorArray = Array.isArray(errors) ? errors : errors.array();
    const errorMap = buildErrorMap(errorArray);

    if (wantsJson(req)) {
        return res.status(422).json({
            message: 'Falha de validação.',
            errors: errorMap
        });
    }

    if (errorArray.length) {
        errorArray.forEach((error) => {
            if (error.msg) {
                req.flash('error_msg', error.msg);
            }
        });
    }

    res.locals.pageTitle = isEdit ? 'Editar promoção' : 'Nova promoção';
    return res.status(422).render('promotions/form', {
        promotion: formState,
        isEdit,
        productOptions,
        validationErrors: errorMap,
        typeLabels: PROMOTION_TYPE_LABELS,
        discountLabels: PROMOTION_DISCOUNT_LABELS
    });
};

const renderPromotionForm = async (req, res, formState, { isEdit = false, errors = {} } = {}) => {
    const productOptions = await getProductOptions();
    res.locals.pageTitle = isEdit ? 'Editar promoção' : 'Nova promoção';

    return res.render('promotions/form', {
        promotion: formState,
        isEdit,
        productOptions,
        validationErrors: errors,
        typeLabels: PROMOTION_TYPE_LABELS,
        discountLabels: PROMOTION_DISCOUNT_LABELS
    });
};

const promotionController = {
    listPromotions: async (req, res) => {
        const statusFilter = typeof req.query.status === 'string' ? req.query.status : 'all';
        try {
            const promotions = await listPromotionsService({ status: statusFilter });
            const formatted = promotions.map((promotion) => ({
                ...promotion,
                typeLabel: PROMOTION_TYPE_LABELS[promotion.type] || promotion.type,
                discountLabel: PROMOTION_DISCOUNT_LABELS[promotion.discountType] || promotion.discountType
            }));

            if (wantsJson(req)) {
                return res.json({ data: formatted });
            }

            res.locals.pageTitle = 'Promoções';
            return res.render('promotions/list', {
                promotions: formatted,
                filters: { status: statusFilter },
                statusOptions: STATUS_FILTER_OPTIONS
            });
        } catch (error) {
            console.error('[promotionController] Falha ao listar promoções:', error);
            if (wantsJson(req)) {
                return res.status(500).json({ message: 'Não foi possível carregar as promoções.' });
            }
            req.flash('error_msg', 'Não foi possível carregar as promoções.');
            return res.redirect('/');
        }
    },

    renderCreateForm: async (req, res) => {
        try {
            return await renderPromotionForm(req, res, { ...DEFAULT_FORM_STATE });
        } catch (error) {
            console.error('[promotionController] Falha ao exibir formulário de criação de promoções:', error);
            req.flash('error_msg', 'Não foi possível carregar o formulário.');
            return res.redirect('/promotions');
        }
    },

    createPromotion: [
        ...promotionValidationRules,
        async (req, res) => {
            const validation = validationResult(req);
            const formState = buildFormState(req.body);
            const productOptions = await getProductOptions();

            if (!validation.isEmpty()) {
                return handleValidationFailure(req, res, validation, formState, productOptions, false);
            }

            try {
                const promotion = await createPromotionService(req.body);

                if (wantsJson(req)) {
                    return res.status(201).json({ data: promotion });
                }

                req.flash('success_msg', 'Promoção criada com sucesso.');
                return res.redirect('/promotions');
            } catch (error) {
                console.error('[promotionController] Falha ao criar promoção:', error);
                const errors = buildErrorMap([{ param: 'form', msg: error.message || 'Erro ao criar promoção.' }]);
                return handleValidationFailure(req, res, errors, formState, productOptions, false);
            }
        }
    ],

    renderEditForm: async (req, res) => {
        try {
            const promotion = await getPromotionById(req.params.id);
            if (!promotion) {
                req.flash('error_msg', 'Promoção não encontrada.');
                return res.redirect('/promotions');
            }

            return await renderPromotionForm(req, res, buildFormState(promotion), { isEdit: true });
        } catch (error) {
            console.error('[promotionController] Falha ao exibir formulário de edição de promoções:', error);
            req.flash('error_msg', 'Não foi possível carregar o formulário de edição.');
            return res.redirect('/promotions');
        }
    },

    updatePromotion: [
        ...promotionValidationRules,
        async (req, res) => {
            const validation = validationResult(req);
            const promotionId = req.params.id;
            const formState = buildFormState({ ...req.body, id: promotionId });
            const productOptions = await getProductOptions();

            if (!validation.isEmpty()) {
                return handleValidationFailure(req, res, validation, formState, productOptions, true);
            }

            try {
                const promotion = await updatePromotionService(promotionId, req.body);

                if (wantsJson(req)) {
                    return res.json({ data: promotion });
                }

                req.flash('success_msg', 'Promoção atualizada com sucesso.');
                return res.redirect('/promotions');
            } catch (error) {
                console.error('[promotionController] Falha ao atualizar promoção:', error);
                const errors = buildErrorMap([{ param: 'form', msg: error.message || 'Erro ao atualizar promoção.' }]);
                return handleValidationFailure(req, res, errors, formState, productOptions, true);
            }
        }
    ],

    deletePromotion: async (req, res) => {
        try {
            await deletePromotionService(req.params.id);
            if (wantsJson(req)) {
                return res.status(204).end();
            }

            req.flash('success_msg', 'Promoção removida com sucesso.');
            return res.redirect('/promotions');
        } catch (error) {
            console.error('[promotionController] Falha ao remover promoção:', error);
            if (wantsJson(req)) {
                return res.status(500).json({ message: error.message || 'Erro ao remover promoção.' });
            }

            req.flash('error_msg', error.message || 'Erro ao remover promoção.');
            return res.redirect('/promotions');
        }
    }
};

module.exports = promotionController;
module.exports.promotionValidationRules = promotionValidationRules;
