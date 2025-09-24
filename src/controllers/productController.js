'use strict';

const { body, validationResult } = require('express-validator');
const {
    sequelize,
    Product,
    ProductVariation,
    ProductMedia,
    ProductSupplier,
    Sequelize
} = require('../../database/models');

const PRODUCT_STATUS = ['draft', 'active', 'inactive', 'archived'];
const PRODUCT_VISIBILITY = ['public', 'private', 'restricted'];
const PRODUCT_DISCOUNT_TYPES = ['none', 'percentage', 'fixed'];
const PRODUCT_STOCK_STATUS = ['in-stock', 'out-of-stock', 'preorder', 'backorder'];
const MEDIA_TYPES = ['image', 'video', 'document'];

const DEFAULT_FORM_STATE = {
    companyId: null,
    status: 'draft',
    visibility: 'public',
    discountType: 'none',
    stockStatus: 'in-stock',
    currency: 'BRL',
    taxIncluded: true,
    requiresShipping: true,
    allowBackorder: false,
    isFeatured: false,
    weightUnit: 'kg',
    dimensionsUnit: 'cm',
    variations: [],
    media: [],
    suppliers: []
};

const wantsJson = (req) => {
    const acceptHeader = (req.headers.accept || '').toLowerCase();
    const contentType = (req.headers['content-type'] || '').toLowerCase();
    return req.xhr || acceptHeader.includes('application/json') || contentType.includes('application/json');
};

const resolveCompanyIdFromRequest = (req) => {
    const directCompanyId = req.user && req.user.companyId !== undefined ? req.user.companyId : null;
    const sessionCompanyId = req.session && req.session.user
        ? req.session.user.companyId
        : null;

    const candidate = directCompanyId ?? sessionCompanyId;
    const parsed = Number.parseInt(candidate, 10);

    if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
    }

    return null;
};

const hasValue = (value) => {
    if (value === undefined || value === null) {
        return false;
    }

    if (typeof value === 'string') {
        return value.trim().length > 0;
    }

    return true;
};

const sanitizeString = (value) => {
    if (!hasValue(value)) {
        return null;
    }

    return String(value).trim();
};

const sanitizeSlug = (value) => {
    const sanitized = sanitizeString(value);
    return sanitized ? sanitized.toLowerCase() : null;
};

const sanitizeUpper = (value) => {
    const sanitized = sanitizeString(value);
    return sanitized ? sanitized.toUpperCase() : null;
};

const sanitizeLowerCase = (value) => {
    const sanitized = sanitizeString(value);
    return sanitized ? sanitized.toLowerCase() : null;
};

const parseDecimal = (value) => {
    if (!hasValue(value)) {
        return null;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    const normalized = String(value)
        .replace(/\s+/g, '')
        .replace(/\.(?=.*\.)/g, '')
        .replace(',', '.');

    const parsed = Number(normalized);

    return Number.isFinite(parsed) ? parsed : null;
};

const parseInteger = (value) => {
    const parsed = parseDecimal(value);

    if (parsed === null) {
        return null;
    }

    if (!Number.isFinite(parsed)) {
        return null;
    }

    if (!Number.isInteger(parsed)) {
        const truncated = Math.trunc(parsed);
        if (Math.abs(parsed - truncated) > 1e-6) {
            return null;
        }
        return truncated;
    }

    return parsed;
};

const parseDateValue = (value) => {
    if (!hasValue(value)) {
        return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
};

const normalizeBoolean = (value, defaultValue = false) => {
    if (Array.isArray(value)) {
        if (!value.length) {
            return defaultValue;
        }

        return value.some((entry) => normalizeBoolean(entry, defaultValue));
    }

    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value > 0 : defaultValue;
    }

    const normalized = String(value).trim().toLowerCase();

    if (['1', 'true', 'on', 'yes', 'sim'].includes(normalized)) {
        return true;
    }

    if (['0', 'false', 'off', 'no', 'não', 'nao'].includes(normalized)) {
        return false;
    }

    return defaultValue;
};

const normalizeArrayPayload = (value) => {
    if (!value) {
        return [];
    }

    if (Array.isArray(value)) {
        return value;
    }

    if (typeof value === 'object') {
        return Object.keys(value)
            .sort()
            .map((key) => value[key]);
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return [];
        }

        try {
            const parsed = JSON.parse(trimmed);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    return [];
};

const parseJSONField = (value) => {
    if (!hasValue(value)) {
        return null;
    }

    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        } catch (error) {
            return null;
        }
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
        return value;
    }

    return null;
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

const buildFormStateFromPayload = (productData, variations, media, suppliers, extras = {}) => {
    const convertDateForForm = (value) => {
        if (!value) {
            return '';
        }

        const date = value instanceof Date ? value : new Date(value);

        if (Number.isNaN(date.getTime())) {
            return '';
        }

        return date.toISOString().slice(0, 10);
    };

    const convertValue = (value) => {
        if (value === undefined || value === null) {
            return '';
        }

        if (value instanceof Date) {
            return convertDateForForm(value);
        }

        return value;
    };

    const formState = {
        ...DEFAULT_FORM_STATE,
        ...extras
    };

    Object.entries(productData).forEach(([key, value]) => {
        if (key === 'releaseDate') {
            formState[key] = convertDateForForm(value);
        } else {
            formState[key] = convertValue(value);
        }
    });

    formState.variations = (variations || []).map((variation) => ({
        ...variation,
        price: convertValue(variation.price),
        costPrice: convertValue(variation.costPrice),
        stockQuantity: convertValue(variation.stockQuantity),
        weight: convertValue(variation.weight),
        attributes: variation.attributes ? JSON.stringify(variation.attributes) : ''
    }));

    formState.media = (media || []).map((item) => ({
        ...item,
        position: convertValue(item.position),
        metadata: item.metadata ? JSON.stringify(item.metadata) : ''
    }));

    formState.suppliers = (suppliers || []).map((supplier) => ({
        ...supplier,
        supplierPrice: convertValue(supplier.supplierPrice),
        leadTimeDays: convertValue(supplier.leadTimeDays),
        minimumOrderQuantity: convertValue(supplier.minimumOrderQuantity)
    }));

    return formState;
};

const mapProductPayload = (body, { companyId } = {}) => {
    const productData = {
        name: sanitizeString(body.name),
        slug: sanitizeSlug(body.slug),
        sku: sanitizeString(body.sku),
        barcode: sanitizeString(body.barcode),
        status: PRODUCT_STATUS.includes(body.status) ? body.status : 'draft',
        visibility: PRODUCT_VISIBILITY.includes(body.visibility) ? body.visibility : 'public',
        type: sanitizeString(body.type),
        brand: sanitizeString(body.brand),
        shortDescription: sanitizeString(body.shortDescription),
        description: sanitizeString(body.description),
        costPrice: parseDecimal(body.costPrice),
        price: parseDecimal(body.price),
        compareAtPrice: parseDecimal(body.compareAtPrice),
        currency: sanitizeUpper(body.currency) || 'BRL',
        taxIncluded: normalizeBoolean(body.taxIncluded, true),
        discountType: PRODUCT_DISCOUNT_TYPES.includes(body.discountType) ? body.discountType : 'none',
        discountValue: parseDecimal(body.discountValue),
        stockQuantity: parseInteger(body.stockQuantity),
        stockStatus: PRODUCT_STOCK_STATUS.includes(body.stockStatus) ? body.stockStatus : 'in-stock',
        allowBackorder: normalizeBoolean(body.allowBackorder, false),
        lowStockThreshold: parseInteger(body.lowStockThreshold),
        maxStockThreshold: parseInteger(body.maxStockThreshold),
        ncmCode: sanitizeString(body.ncmCode),
        cestCode: sanitizeString(body.cestCode),
        taxClass: sanitizeString(body.taxClass),
        taxRate: parseDecimal(body.taxRate),
        fiscalBenefitCode: sanitizeString(body.fiscalBenefitCode),
        origin: sanitizeString(body.origin),
        weight: parseDecimal(body.weight),
        height: parseDecimal(body.height),
        width: parseDecimal(body.width),
        length: parseDecimal(body.length),
        weightUnit: sanitizeLowerCase(body.weightUnit) || 'kg',
        dimensionsUnit: sanitizeLowerCase(body.dimensionsUnit) || 'cm',
        requiresShipping: normalizeBoolean(body.requiresShipping, true),
        shippingClass: sanitizeString(body.shippingClass),
        deliveryTimeMin: parseInteger(body.deliveryTimeMin),
        deliveryTimeMax: parseInteger(body.deliveryTimeMax),
        seoTitle: sanitizeString(body.seoTitle),
        seoDescription: sanitizeString(body.seoDescription),
        seoKeywords: sanitizeString(body.seoKeywords),
        tags: sanitizeString(body.tags),
        isFeatured: normalizeBoolean(body.isFeatured, false),
        releaseDate: parseDateValue(body.releaseDate),
        canonicalUrl: sanitizeString(body.canonicalUrl),
        metaImageUrl: sanitizeString(body.metaImageUrl)
    };

    const normalizedCompanyId = Number.isInteger(companyId) ? companyId : Number.parseInt(companyId, 10);
    if (Number.isInteger(normalizedCompanyId) && normalizedCompanyId > 0) {
        productData.companyId = normalizedCompanyId;
    }

    if (productData.stockQuantity === null || Number.isNaN(productData.stockQuantity)) {
        productData.stockQuantity = 0;
    }

    const variationsRaw = normalizeArrayPayload(body.variations);
    const suppliersRaw = normalizeArrayPayload(body.suppliers);
    const mediaRaw = normalizeArrayPayload(body.media);

    const variations = variationsRaw
        .map((variation) => {
            const normalized = typeof variation === 'object' && variation !== null ? variation : {};
            const name = sanitizeString(normalized.name);
            const hasAnyValue = ['sku', 'price', 'costPrice', 'stockQuantity', 'barcode', 'weight', 'attributes']
                .some((key) => hasValue(normalized[key]));

            if (!name && !hasAnyValue) {
                return null;
            }

            return {
                name,
                sku: sanitizeString(normalized.sku),
                barcode: sanitizeString(normalized.barcode),
                price: parseDecimal(normalized.price),
                costPrice: parseDecimal(normalized.costPrice),
                stockQuantity: parseInteger(normalized.stockQuantity) ?? 0,
                attributes: parseJSONField(normalized.attributes),
                weight: parseDecimal(normalized.weight)
            };
        })
        .filter(Boolean);

    const suppliers = suppliersRaw
        .map((supplier) => {
            const normalized = typeof supplier === 'object' && supplier !== null ? supplier : {};
            const name = sanitizeString(normalized.supplierName);
            const hasAnyValue = ['supplierSku', 'supplierPrice', 'leadTimeDays', 'minimumOrderQuantity', 'contactEmail', 'contactPhone', 'isPreferred']
                .some((key) => hasValue(normalized[key]));

            if (!name && !hasAnyValue) {
                return null;
            }

            return {
                supplierName: name,
                supplierSku: sanitizeString(normalized.supplierSku),
                supplierPrice: parseDecimal(normalized.supplierPrice),
                leadTimeDays: parseInteger(normalized.leadTimeDays),
                minimumOrderQuantity: parseInteger(normalized.minimumOrderQuantity),
                contactEmail: sanitizeString(normalized.contactEmail),
                contactPhone: sanitizeString(normalized.contactPhone),
                isPreferred: normalizeBoolean(normalized.isPreferred, false)
            };
        })
        .filter(Boolean);

    const media = mediaRaw
        .map((item) => {
            const normalized = typeof item === 'object' && item !== null ? item : {};
            const url = sanitizeString(normalized.url);
            const hasAnyValue = ['altText', 'metadata', 'isPrimary', 'position', 'type']
                .some((key) => hasValue(normalized[key]));

            if (!url && !hasAnyValue) {
                return null;
            }

            const type = MEDIA_TYPES.includes(normalized.type) ? normalized.type : 'image';

            return {
                type,
                url,
                altText: sanitizeString(normalized.altText),
                position: parseInteger(normalized.position) ?? 0,
                isPrimary: normalizeBoolean(normalized.isPrimary, false),
                metadata: parseJSONField(normalized.metadata)
            };
        })
        .filter(Boolean);

    return { productData, variations, suppliers, media };
};

const mapProductInstance = (instance) => {
    if (!instance) {
        return null;
    }

    const base = typeof instance.toSafeJSON === 'function'
        ? instance.toSafeJSON()
        : instance.get({ plain: true });

    return {
        ...base,
        variations: (instance.variations || []).map((variation) =>
            (typeof variation.toSafeJSON === 'function' ? variation.toSafeJSON() : variation)
        ),
        media: (instance.media || []).map((item) =>
            (typeof item.toSafeJSON === 'function' ? item.toSafeJSON() : item)
        ),
        suppliers: (instance.suppliers || []).map((supplier) =>
            (typeof supplier.toSafeJSON === 'function' ? supplier.toSafeJSON() : supplier)
        )
    };
};

const handleValidationFailure = (req, res, errors, formState, isEdit) => {
    const errorArray = Array.isArray(errors) ? errors : errors.array();
    const errorMap = buildErrorMap(errorArray);

    if (wantsJson(req)) {
        return res.status(422).json({
            message: 'Falha de validação.',
            errors: errorMap
        });
    }

    errorArray.forEach((error) => {
        if (error.msg) {
            req.flash('error_msg', error.msg);
        }
    });

    res.locals.pageTitle = isEdit ? 'Editar produto' : 'Novo produto';

    return res.status(422).render('products/form', {
        product: formState,
        isEdit,
        validationErrors: errorMap
    });
};

const handlePersistenceError = (req, res, error, formState, isEdit) => {
    console.error('[productController] Persistência falhou:', error);

    if (error instanceof Sequelize.UniqueConstraintError) {
        const messages = error.errors.map((uniqueError) => ({
            path: uniqueError.path,
            msg: uniqueError.message || 'Registro duplicado.'
        }));
        return handleValidationFailure(req, res, messages, formState, isEdit);
    }

    if (wantsJson(req)) {
        return res.status(500).json({ message: 'Não foi possível processar sua requisição.' });
    }

    req.flash('error_msg', 'Não foi possível processar sua requisição. Tente novamente.');
    res.locals.pageTitle = isEdit ? 'Editar produto' : 'Novo produto';

    return res.status(500).render('products/form', {
        product: formState,
        isEdit,
        validationErrors: {}
    });
};

const decimalField = (field, message, { allowNegative = false } = {}) =>
    body(field).custom((value) => {
        if (!hasValue(value)) {
            return true;
        }

        const parsed = parseDecimal(value);

        if (parsed === null) {
            throw new Error(message);
        }

        if (!allowNegative && parsed < 0) {
            throw new Error(message);
        }

        return true;
    });

const integerField = (field, message, { min = 0 } = {}) =>
    body(field).custom((value) => {
        if (!hasValue(value)) {
            return true;
        }

        const parsed = parseInteger(value);

        if (parsed === null) {
            throw new Error(message);
        }

        if (parsed < min) {
            throw new Error(message);
        }

        return true;
    });

const productValidationRules = [
    body('name')
        .trim()
        .notEmpty().withMessage('Nome do produto é obrigatório.')
        .isLength({ min: 3, max: 180 }).withMessage('Nome deve ter entre 3 e 180 caracteres.'),
    body('slug')
        .optional({ checkFalsy: true })
        .trim()
        .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .withMessage('Slug deve conter apenas letras minúsculas, números e hífens.'),
    body('sku')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 80 }).withMessage('SKU deve ter até 80 caracteres.'),
    body('status')
        .optional({ checkFalsy: true })
        .isIn(PRODUCT_STATUS)
        .withMessage('Status informado é inválido.'),
    body('visibility')
        .optional({ checkFalsy: true })
        .isIn(PRODUCT_VISIBILITY)
        .withMessage('Visibilidade informada é inválida.'),
    body('discountType')
        .optional({ checkFalsy: true })
        .isIn(PRODUCT_DISCOUNT_TYPES)
        .withMessage('Tipo de desconto é inválido.'),
    body('stockStatus')
        .optional({ checkFalsy: true })
        .isIn(PRODUCT_STOCK_STATUS)
        .withMessage('Status de estoque inválido.'),
    decimalField('costPrice', 'Preço de custo deve ser um número válido.'),
    decimalField('price', 'Preço de venda deve ser um número válido.'),
    decimalField('compareAtPrice', 'Preço original deve ser um número válido.'),
    decimalField('discountValue', 'Valor de desconto deve ser um número válido.'),
    integerField('stockQuantity', 'Quantidade em estoque deve ser um número inteiro não negativo.'),
    integerField('lowStockThreshold', 'Estoque mínimo deve ser um número inteiro não negativo.'),
    integerField('maxStockThreshold', 'Estoque máximo deve ser um número inteiro não negativo.'),
    decimalField('taxRate', 'Alíquota fiscal deve ser um número válido.', { allowNegative: false }),
    decimalField('weight', 'Peso deve ser um número válido.'),
    decimalField('height', 'Altura deve ser um número válido.'),
    decimalField('width', 'Largura deve ser um número válido.'),
    decimalField('length', 'Comprimento deve ser um número válido.'),
    integerField('deliveryTimeMin', 'Prazo mínimo deve ser um número inteiro não negativo.'),
    integerField('deliveryTimeMax', 'Prazo máximo deve ser um número inteiro não negativo.'),
    body('releaseDate')
        .optional({ checkFalsy: true })
        .isISO8601()
        .withMessage('Data de lançamento deve estar no formato ISO (YYYY-MM-DD).'),
    body('media').customSanitizer(normalizeArrayPayload),
    body('media').custom((items) => {
        items.forEach((item, index) => {
            const normalized = typeof item === 'object' && item !== null ? item : {};
            if (hasValue(normalized.url) && !hasValue(normalized.type)) {
                return;
            }
            if (!hasValue(normalized.url) && hasValue(normalized.type)) {
                throw new Error(`Mídia ${index + 1}: URL é obrigatória quando o tipo é informado.`);
            }
            if (hasValue(normalized.type) && !MEDIA_TYPES.includes(normalized.type)) {
                throw new Error(`Mídia ${index + 1}: tipo inválido.`);
            }
        });
        return true;
    }),
    body('variations').customSanitizer(normalizeArrayPayload),
    body('variations').custom((variations) => {
        variations.forEach((variation, index) => {
            const normalized = typeof variation === 'object' && variation !== null ? variation : {};
            const name = sanitizeString(normalized.name);
            const hasAnyValue = ['sku', 'price', 'costPrice', 'stockQuantity', 'barcode', 'weight', 'attributes']
                .some((key) => hasValue(normalized[key]));

            if (hasAnyValue && !name) {
                throw new Error(`Variação ${index + 1}: nome é obrigatório quando houver dados.`);
            }
        });
        return true;
    }),
    decimalField('variations.*.price', 'Preço da variação deve ser um número válido.'),
    decimalField('variations.*.costPrice', 'Preço de custo da variação deve ser um número válido.'),
    integerField('variations.*.stockQuantity', 'Estoque da variação deve ser um número inteiro não negativo.'),
    decimalField('variations.*.weight', 'Peso da variação deve ser um número válido.'),
    body('suppliers').customSanitizer(normalizeArrayPayload),
    body('suppliers').custom((suppliers) => {
        suppliers.forEach((supplier, index) => {
            const normalized = typeof supplier === 'object' && supplier !== null ? supplier : {};
            const name = sanitizeString(normalized.supplierName);
            const hasAnyValue = ['supplierSku', 'supplierPrice', 'leadTimeDays', 'minimumOrderQuantity', 'contactEmail', 'contactPhone']
                .some((key) => hasValue(normalized[key]));

            if (hasAnyValue && !name) {
                throw new Error(`Fornecedor ${index + 1}: nome é obrigatório quando houver dados.`);
            }

            if (hasValue(normalized.contactEmail) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.contactEmail.trim())) {
                throw new Error(`Fornecedor ${index + 1}: e-mail inválido.`);
            }
        });
        return true;
    })
];

const fetchProductWithRelations = async (productId, companyId, transaction) => {
    const where = { id: productId };

    if (Number.isInteger(companyId) && companyId > 0) {
        where.companyId = companyId;
    }

    return Product.findOne({
        where,
        include: [
            { model: ProductVariation, as: 'variations' },
            { model: ProductMedia, as: 'media' },
            { model: ProductSupplier, as: 'suppliers' }
        ],
        order: [
            [{ model: ProductMedia, as: 'media' }, 'position', 'ASC'],
            [{ model: ProductVariation, as: 'variations' }, 'createdAt', 'ASC'],
            [{ model: ProductSupplier, as: 'suppliers' }, 'createdAt', 'ASC']
        ],
        transaction
    });
};

const listProducts = async (req, res) => {
    try {
        const companyId = resolveCompanyIdFromRequest(req);
        const where = {};

        if (Number.isInteger(companyId) && companyId > 0) {
            where.companyId = companyId;
        }

        const products = await Product.findAll({
            where,
            include: [
                { model: ProductVariation, as: 'variations' },
                { model: ProductMedia, as: 'media' },
                { model: ProductSupplier, as: 'suppliers' }
            ],
            order: [['createdAt', 'DESC']],
            limit: 100
        });

        const formatted = products.map(mapProductInstance);

        if (wantsJson(req)) {
            return res.json({ data: formatted });
        }

        res.locals.pageTitle = 'Produtos';

        return res.render('products/list', {
            products: formatted
        });
    } catch (error) {
        console.error('[productController] Falha ao listar produtos:', error);
        if (wantsJson(req)) {
            return res.status(500).json({ message: 'Não foi possível carregar os produtos.' });
        }
        req.flash('error_msg', 'Não foi possível carregar os produtos. Tente novamente.');
        return res.redirect('/');
    }
};

const renderCreateForm = (req, res) => {
    const companyId = resolveCompanyIdFromRequest(req);
    res.locals.pageTitle = 'Novo produto';
    return res.render('products/form', {
        product: { ...DEFAULT_FORM_STATE, companyId },
        isEdit: false,
        validationErrors: {}
    });
};

const renderEditForm = async (req, res) => {
    try {
        const companyId = resolveCompanyIdFromRequest(req);
        const product = await fetchProductWithRelations(req.params.id, companyId);

        if (!product) {
            req.flash('error_msg', 'Produto não encontrado.');
            return res.redirect('/products');
        }

        const mapped = mapProductInstance(product);
        const formState = buildFormStateFromPayload(mapped, mapped.variations, mapped.media, mapped.suppliers, { id: mapped.id });

        res.locals.pageTitle = 'Editar produto';

        return res.render('products/form', {
            product: formState,
            isEdit: true,
            validationErrors: {}
        });
    } catch (error) {
        console.error('[productController] Falha ao carregar produto para edição:', error);
        req.flash('error_msg', 'Não foi possível carregar o produto.');
        return res.redirect('/products');
    }
};

const showProductDetail = async (req, res) => {
    try {
        const companyId = resolveCompanyIdFromRequest(req);
        const product = await fetchProductWithRelations(req.params.id, companyId);

        if (!product) {
            if (wantsJson(req)) {
                return res.status(404).json({ message: 'Produto não encontrado.' });
            }
            req.flash('error_msg', 'Produto não encontrado.');
            return res.redirect('/products');
        }

        const mapped = mapProductInstance(product);

        if (wantsJson(req)) {
            return res.json({ data: mapped });
        }

        res.locals.pageTitle = mapped.name;

        return res.render('products/detail', {
            product: mapped
        });
    } catch (error) {
        console.error('[productController] Falha ao exibir produto:', error);
        if (wantsJson(req)) {
            return res.status(500).json({ message: 'Não foi possível carregar o produto.' });
        }
        req.flash('error_msg', 'Não foi possível carregar o produto solicitado.');
        return res.redirect('/products');
    }
};

const createProduct = async (req, res) => {
    const companyId = resolveCompanyIdFromRequest(req);
    const validation = validationResult(req);
    const { productData, variations, media, suppliers } = mapProductPayload(req.body, { companyId });
    const formState = buildFormStateFromPayload(productData, variations, media, suppliers);

    if (!validation.isEmpty()) {
        return handleValidationFailure(req, res, validation, formState, false);
    }

    try {
        let createdProduct;

        await sequelize.transaction(async (transaction) => {
            createdProduct = await Product.create(productData, { transaction });

            if (variations.length) {
                await ProductVariation.bulkCreate(
                    variations.map((variation) => ({ ...variation, productId: createdProduct.id })),
                    { transaction }
                );
            }

            if (media.length) {
                await ProductMedia.bulkCreate(
                    media.map((item) => ({ ...item, productId: createdProduct.id })),
                    { transaction }
                );
            }

            if (suppliers.length) {
                await ProductSupplier.bulkCreate(
                    suppliers.map((supplier) => ({ ...supplier, productId: createdProduct.id })),
                    { transaction }
                );
            }
        });

        const freshProduct = await fetchProductWithRelations(createdProduct.id, productData.companyId);
        const mapped = mapProductInstance(freshProduct);

        if (wantsJson(req)) {
            return res.status(201).json({ data: mapped });
        }

        req.flash('success_msg', 'Produto criado com sucesso.');
        return res.redirect(`/products/${mapped.id}`);
    } catch (error) {
        return handlePersistenceError(req, res, error, formState, false);
    }
};

const updateProduct = async (req, res) => {
    const companyId = resolveCompanyIdFromRequest(req);
    const product = await fetchProductWithRelations(req.params.id, companyId);

    if (!product) {
        if (wantsJson(req)) {
            return res.status(404).json({ message: 'Produto não encontrado.' });
        }
        req.flash('error_msg', 'Produto não encontrado.');
        return res.redirect('/products');
    }

    const validation = validationResult(req);
    const { productData, variations, media, suppliers } = mapProductPayload(req.body, { companyId });
    const formState = buildFormStateFromPayload({ ...mapProductInstance(product), ...productData }, variations, media, suppliers, { id: product.id });

    if (!validation.isEmpty()) {
        return handleValidationFailure(req, res, validation, formState, true);
    }

    try {
        await sequelize.transaction(async (transaction) => {
            await product.update(productData, { transaction });

            await ProductVariation.destroy({ where: { productId: product.id }, transaction });
            await ProductMedia.destroy({ where: { productId: product.id }, transaction });
            await ProductSupplier.destroy({ where: { productId: product.id }, transaction });

            if (variations.length) {
                await ProductVariation.bulkCreate(
                    variations.map((variation) => ({ ...variation, productId: product.id })),
                    { transaction }
                );
            }

            if (media.length) {
                await ProductMedia.bulkCreate(
                    media.map((item) => ({ ...item, productId: product.id })),
                    { transaction }
                );
            }

            if (suppliers.length) {
                await ProductSupplier.bulkCreate(
                    suppliers.map((supplier) => ({ ...supplier, productId: product.id })),
                    { transaction }
                );
            }
        });

        const freshProduct = await fetchProductWithRelations(product.id, companyId);
        const mapped = mapProductInstance(freshProduct);

        if (wantsJson(req)) {
            return res.json({ data: mapped });
        }

        req.flash('success_msg', 'Produto atualizado com sucesso.');
        return res.redirect(`/products/${mapped.id}`);
    } catch (error) {
        return handlePersistenceError(req, res, error, formState, true);
    }
};

const deleteProduct = async (req, res) => {
    try {
        const companyId = resolveCompanyIdFromRequest(req);
        const where = { id: req.params.id };

        if (Number.isInteger(companyId) && companyId > 0) {
            where.companyId = companyId;
        }

        const product = await Product.findOne({ where });

        if (!product) {
            if (wantsJson(req)) {
                return res.status(404).json({ message: 'Produto não encontrado.' });
            }
            req.flash('error_msg', 'Produto não encontrado.');
            return res.redirect('/products');
        }

        await product.destroy();

        if (wantsJson(req)) {
            return res.status(204).end();
        }

        req.flash('success_msg', 'Produto removido com sucesso.');
        return res.redirect('/products');
    } catch (error) {
        console.error('[productController] Falha ao excluir produto:', error);
        if (wantsJson(req)) {
            return res.status(500).json({ message: 'Não foi possível excluir o produto.' });
        }
        req.flash('error_msg', 'Não foi possível excluir o produto.');
        return res.redirect('/products');
    }
};

module.exports = {
    listProducts,
    renderCreateForm,
    createProduct,
    renderEditForm,
    updateProduct,
    deleteProduct,
    showProductDetail,
    createValidations: productValidationRules,
    updateValidations: productValidationRules
};
