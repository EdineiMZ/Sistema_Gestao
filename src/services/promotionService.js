'use strict';

const { Promotion, Product, sequelize, Sequelize } = require('../../database/models');

const { PROMOTION_TYPES, PROMOTION_DISCOUNT_TYPES } = require('../../database/models/promotion');

const { Op, fn, col } = Sequelize;

const sanitizeString = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length ? trimmed : null;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    return null;
};

const normalizeBoolean = (value, defaultValue = true) => {
    if (value === undefined || value === null) {
        return defaultValue;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number') {
        return value > 0;
    }

    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'sim'].includes(normalized)) {
        return true;
    }
    if (['0', 'false', 'no', 'off', 'não', 'nao'].includes(normalized)) {
        return false;
    }

    return defaultValue;
};

const parseDecimal = (value) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
    }

    const normalized = String(value)
        .replace(/\s+/g, '')
        .replace(/\.(?=.*\.)/g, '')
        .replace(',', '.');

    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
};

const parseDateValue = (value) => {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed;
};

const formatCurrency = (value) => {
    const amount = Number.parseFloat(value || 0);
    if (!Number.isFinite(amount)) {
        return 'R$ 0,00';
    }

    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
};

const buildDiscountLabel = (promotion) => {
    if (!promotion) {
        return null;
    }

    if (promotion.discountType === 'percentage') {
        return `${Number(promotion.discountValue).toFixed(2).replace(/\.00$/, '')}% OFF`;
    }

    return `${formatCurrency(promotion.discountValue)} OFF`;
};

const capitalize = (value) => {
    if (!value) {
        return '';
    }

    return value
        .toString()
        .trim()
        .toLowerCase()
        .replace(/(^|\s)([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
};

const buildTargetLabel = (promotion) => {
    if (!promotion) {
        return null;
    }

    switch (promotion.type) {
        case 'brand':
            return promotion.targetBrand ? `Marca · ${capitalize(promotion.targetBrand)}` : 'Marca';
        case 'category':
            return promotion.targetCategory ? `Categoria · ${capitalize(promotion.targetCategory)}` : 'Categoria';
        case 'product':
            if (promotion.product) {
                const parts = [promotion.product.name];
                if (promotion.product.sku) {
                    parts.push(`SKU ${promotion.product.sku}`);
                }
                return `Produto · ${parts.join(' · ')}`;
            }
            return promotion.targetProductId ? `Produto #${promotion.targetProductId}` : 'Produto';
        case 'store':
        default:
            return 'Loja inteira';
    }
};

const formatDateIso = (value) => {
    if (!value) {
        return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.toISOString();
};

const determineStatus = (promotion, now = new Date()) => {
    if (!promotion) {
        return { key: 'inactive', label: 'Inativa', variant: 'secondary' };
    }

    if (!promotion.isActive) {
        return { key: 'inactive', label: 'Inativa', variant: 'secondary' };
    }

    const startDate = promotion.startDate ? new Date(promotion.startDate) : null;
    const endDate = promotion.endDate ? new Date(promotion.endDate) : null;

    if (startDate && startDate > now) {
        return { key: 'scheduled', label: 'Agendada', variant: 'info' };
    }

    if (endDate && endDate < now) {
        return { key: 'expired', label: 'Expirada', variant: 'danger' };
    }

    return { key: 'active', label: 'Ativa', variant: 'success' };
};

const formatPromotion = (promotion, { now = new Date() } = {}) => {
    if (!promotion) {
        return null;
    }

    const plain = typeof promotion.toSafeJSON === 'function'
        ? promotion.toSafeJSON()
        : promotion.get({ plain: true });

    const status = determineStatus(plain, now);

    const formatted = {
        ...plain,
        discountValue: plain.discountValue !== null ? Number(plain.discountValue) : null,
        startDate: formatDateIso(plain.startDate),
        endDate: formatDateIso(plain.endDate),
        targetLabel: buildTargetLabel({ ...plain, product: promotion.product || plain.product }),
        discountLabel: buildDiscountLabel(plain),
        status
    };

    if (promotion.product) {
        formatted.product = {
            id: promotion.product.id,
            name: promotion.product.name,
            sku: promotion.product.sku,
            brand: promotion.product.brand,
            category: promotion.product.category
        };
    }

    return formatted;
};

const isWithinSchedule = (promotion, now = new Date()) => {
    const start = promotion.startDate ? new Date(promotion.startDate) : null;
    const end = promotion.endDate ? new Date(promotion.endDate) : null;

    if (start && start > now) {
        return false;
    }

    if (end && end < now) {
        return false;
    }

    return true;
};

const isPromotionActive = (promotion, now = new Date()) => {
    return Boolean(promotion && promotion.isActive && isWithinSchedule(promotion, now));
};

const appliesToProduct = (promotion, product) => {
    if (!promotion || !product) {
        return false;
    }

    switch (promotion.type) {
        case 'store':
            return true;
        case 'brand': {
            const productBrand = sanitizeString(product.brand)?.toLowerCase();
            const promoBrand = sanitizeString(promotion.targetBrand)?.toLowerCase();
            return Boolean(productBrand && promoBrand && productBrand === promoBrand);
        }
        case 'category': {
            const productCategory = sanitizeString(product.category)?.toLowerCase();
            const promoCategory = sanitizeString(promotion.targetCategory)?.toLowerCase();
            return Boolean(productCategory && promoCategory && productCategory === promoCategory);
        }
        case 'product':
            return Number(product.id) === Number(promotion.targetProductId);
        default:
            return false;
    }
};

const calculateDiscountedPrice = (basePrice, promotion) => {
    const price = Number.parseFloat(basePrice || 0);
    if (!Number.isFinite(price) || price <= 0 || !promotion) {
        return { finalPrice: price, discountAmount: 0 };
    }

    const discountValue = Number.parseFloat(promotion.discountValue || 0);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
        return { finalPrice: price, discountAmount: 0 };
    }

    let discountAmount = 0;
    if (promotion.discountType === 'percentage') {
        const percentage = Math.min(Math.max(discountValue, 0), 100);
        discountAmount = (price * percentage) / 100;
    } else {
        discountAmount = discountValue;
    }

    if (discountAmount > price) {
        discountAmount = price;
    }

    const finalPrice = Number((price - discountAmount).toFixed(2));
    return { finalPrice, discountAmount: Number(discountAmount.toFixed(2)) };
};

const resolveBestPromotionForProduct = (product, promotions, { now = new Date() } = {}) => {
    if (!product || !Array.isArray(promotions) || !promotions.length) {
        return { promotion: null, finalPrice: product ? Number(product.unitPrice ?? product.price ?? 0) : 0, discountAmount: 0 };
    }

    const price = Number.parseFloat(product.unitPrice ?? product.price ?? 0) || 0;
    let best = { promotion: null, finalPrice: price, discountAmount: 0 };

    promotions.forEach((promotion) => {
        if (!isPromotionActive(promotion, now) || !appliesToProduct(promotion, product)) {
            return;
        }

        const { finalPrice, discountAmount } = calculateDiscountedPrice(price, promotion);
        if (discountAmount > best.discountAmount || (discountAmount === best.discountAmount && finalPrice < best.finalPrice)) {
            best = { promotion, finalPrice, discountAmount };
        }
    });

    return best;
};

const fetchRelevantPromotions = async (products, { now = new Date() } = {}) => {
    if (!Array.isArray(products) || !products.length) {
        return [];
    }

    const productIds = Array.from(new Set(products.map((product) => Number(product.id)).filter(Boolean)));
    const brandValues = Array.from(new Set(
        products
            .map((product) => sanitizeString(product.brand)?.toLowerCase())
            .filter(Boolean)
    ));
    const categoryValues = Array.from(new Set(
        products
            .map((product) => sanitizeString(product.category)?.toLowerCase())
            .filter(Boolean)
    ));

    const orConditions = [{ type: 'store' }];

    if (brandValues.length) {
        orConditions.push({
            type: 'brand',
            [Op.and]: [
                sequelize.where(fn('LOWER', col('Promotion.targetBrand')), {
                    [Op.in]: brandValues
                })
            ]
        });
    }

    if (categoryValues.length) {
        orConditions.push({
            type: 'category',
            [Op.and]: [
                sequelize.where(fn('LOWER', col('Promotion.targetCategory')), {
                    [Op.in]: categoryValues
                })
            ]
        });
    }

    if (productIds.length) {
        orConditions.push({
            type: 'product',
            targetProductId: { [Op.in]: productIds }
        });
    }

    const promotions = await Promotion.findAll({
        where: {
            isActive: true,
            [Op.and]: [
                {
                    [Op.or]: [
                        { startDate: null },
                        { startDate: { [Op.lte]: now } }
                    ]
                },
                {
                    [Op.or]: [
                        { endDate: null },
                        { endDate: { [Op.gte]: now } }
                    ]
                }
            ],
            [Op.and]: [{ [Op.or]: orConditions }]
        },
        include: [
            {
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'sku', 'brand', 'category']
            }
        ],
        order: [
            ['type', 'ASC'],
            ['discountValue', 'DESC'],
            ['createdAt', 'DESC']
        ]
    });

    return promotions;
};

const applyPromotionsToProducts = async (products, { now = new Date() } = {}) => {
    if (!Array.isArray(products) || !products.length) {
        return [];
    }

    const normalizedProducts = products.map((product) => {
        if (typeof product.toSafeJSON === 'function') {
            return { instance: product, data: product.toSafeJSON() };
        }
        if (typeof product.get === 'function') {
            return { instance: product, data: product.get({ plain: true }) };
        }
        return { instance: null, data: product };
    });

    const relevantPromotions = await fetchRelevantPromotions(
        normalizedProducts.map(({ data }) => data),
        { now }
    );

    return normalizedProducts.map(({ instance, data }) => {
        const { promotion, finalPrice, discountAmount } = resolveBestPromotionForProduct(
            { ...data, brand: data.brand, category: data.category },
            relevantPromotions,
            { now }
        );

        return {
            product: data,
            instance,
            originalPrice: Number.parseFloat(data.unitPrice ?? data.price ?? 0) || 0,
            finalPrice,
            discountAmount,
            promotion: promotion ? formatPromotion(promotion, { now }) : null
        };
    });
};

const buildPromotionPayload = (input = {}) => {
    const type = PROMOTION_TYPES.includes(input.type) ? input.type : null;
    const discountType = PROMOTION_DISCOUNT_TYPES.includes(input.discountType) ? input.discountType : null;
    const discountValue = parseDecimal(input.discountValue);
    const startDate = parseDateValue(input.startDate);
    const endDate = parseDateValue(input.endDate);

    if (!type) {
        throw new Error('Selecione um tipo de promoção válido.');
    }

    if (!discountType) {
        throw new Error('Selecione um tipo de desconto válido.');
    }

    if (discountValue === null || discountValue <= 0) {
        throw new Error('Informe um valor de desconto válido.');
    }

    if (discountType === 'percentage' && discountValue > 100) {
        throw new Error('Descontos percentuais não podem ser superiores a 100%.');
    }

    if (startDate && endDate && endDate < startDate) {
        throw new Error('Data final deve ser posterior à data inicial.');
    }

    const payload = {
        name: sanitizeString(input.name),
        description: sanitizeString(input.description),
        type,
        discountType,
        discountValue,
        targetBrand: null,
        targetCategory: null,
        targetProductId: null,
        startDate,
        endDate,
        isActive: normalizeBoolean(input.isActive, true)
    };

    if (!payload.name) {
        throw new Error('Informe um nome para a promoção.');
    }

    switch (type) {
        case 'brand': {
            const brand = sanitizeString(input.targetBrand);
            if (!brand) {
                throw new Error('Informe a marca para aplicar a promoção.');
            }
            payload.targetBrand = brand;
            break;
        }
        case 'category': {
            const category = sanitizeString(input.targetCategory);
            if (!category) {
                throw new Error('Informe a categoria para aplicar a promoção.');
            }
            payload.targetCategory = category;
            break;
        }
        case 'product': {
            const productId = Number.parseInt(input.targetProductId, 10);
            if (!Number.isFinite(productId) || productId <= 0) {
                throw new Error('Selecione um produto válido.');
            }
            payload.targetProductId = productId;
            break;
        }
        case 'store':
        default:
            break;
    }

    return payload;
};

const createPromotion = async (input = {}) => {
    const payload = buildPromotionPayload(input);

    if (payload.type === 'product') {
        const product = await Product.findByPk(payload.targetProductId);
        if (!product) {
            throw new Error('Produto selecionado não foi encontrado.');
        }
    }

    const promotion = await Promotion.create(payload);
    await promotion.reload({
        include: [
            {
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'sku', 'brand', 'category']
            }
        ]
    });

    return formatPromotion(promotion);
};

const updatePromotion = async (promotionId, input = {}) => {
    const promotion = await Promotion.findByPk(promotionId);

    if (!promotion) {
        throw new Error('Promoção não encontrada.');
    }

    const payload = buildPromotionPayload(input);

    if (payload.type === 'product') {
        const product = await Product.findByPk(payload.targetProductId);
        if (!product) {
            throw new Error('Produto selecionado não foi encontrado.');
        }
    }

    await promotion.update(payload);
    await promotion.reload({
        include: [
            {
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'sku', 'brand', 'category']
            }
        ]
    });

    return formatPromotion(promotion);
};

const deletePromotion = async (promotionId) => {
    const promotion = await Promotion.findByPk(promotionId);

    if (!promotion) {
        throw new Error('Promoção não encontrada.');
    }

    await promotion.destroy();
};

const getPromotionById = async (promotionId) => {
    const promotion = await Promotion.findByPk(promotionId, {
        include: [
            {
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'sku', 'brand', 'category']
            }
        ]
    });

    if (!promotion) {
        return null;
    }

    return formatPromotion(promotion);
};

const listPromotions = async ({ limit = 100, status = 'all' } = {}) => {
    const now = new Date();
    const where = {};

    if (status === 'active') {
        where.isActive = true;
        where[Op.and] = [
            {
                [Op.or]: [
                    { startDate: null },
                    { startDate: { [Op.lte]: now } }
                ]
            },
            {
                [Op.or]: [
                    { endDate: null },
                    { endDate: { [Op.gte]: now } }
                ]
            }
        ];
    }

    const promotions = await Promotion.findAll({
        where,
        include: [
            {
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'sku', 'brand', 'category']
            }
        ],
        order: [
            ['createdAt', 'DESC']
        ],
        limit: Math.min(Number.parseInt(limit, 10) || 100, 200)
    });

    return promotions.map((promotion) => formatPromotion(promotion, { now }));
};

const getProductOptions = async () => {
    const products = await Product.findAll({
        where: { status: 'active' },
        attributes: ['id', 'name', 'sku', 'brand', 'category'],
        order: [
            ['name', 'ASC']
        ],
        limit: 200
    });

    return products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        brand: product.brand,
        category: product.category
    }));
};

module.exports = {
    PROMOTION_TYPES,
    PROMOTION_DISCOUNT_TYPES,
    buildPromotionPayload,
    createPromotion,
    updatePromotion,
    deletePromotion,
    listPromotions,
    getPromotionById,
    getProductOptions,
    applyPromotionsToProducts,
    isPromotionActive,
    determineStatus,
    formatPromotion,
    calculateDiscountedPrice,
    resolveBestPromotionForProduct
};
