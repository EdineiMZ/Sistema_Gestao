'use strict';

const { Company, Product, ProductMedia } = require('../../database/models');

const wantsJson = (req) => {
    const acceptHeader = String(req.headers.accept || '').toLowerCase();
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    return req.xhr || acceptHeader.includes('application/json') || contentType.includes('application/json');
};

const toPlain = (instance) => {
    if (!instance) {
        return null;
    }

    if (typeof instance.toJSON === 'function') {
        return instance.toJSON();
    }

    if (typeof instance.get === 'function') {
        return instance.get({ plain: true });
    }

    return instance;
};

const formatCurrency = (value, currency = 'BRL') => {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
        return null;
    }

    return parsed.toLocaleString('pt-BR', {
        style: 'currency',
        currency
    });
};

const buildProductCard = (product) => {
    const plain = toPlain(product) || {};
    const mediaItems = Array.isArray(plain.media) ? plain.media : [];
    const primaryMedia = mediaItems.find((item) => item.isPrimary) || mediaItems[0] || null;

    const normalizedPrice = formatCurrency(plain.price, plain.currency || 'BRL');
    const compareAtPrice = formatCurrency(plain.compareAtPrice, plain.currency || 'BRL');

    const stockQuantity = Number.parseInt(plain.stockQuantity, 10);
    const lowStockThreshold = plain.lowStockThreshold !== null && plain.lowStockThreshold !== undefined
        ? Number.parseInt(plain.lowStockThreshold, 10)
        : null;

    const isOutOfStock = !Number.isFinite(stockQuantity) || stockQuantity <= 0;
    const isLowStock = !isOutOfStock && Number.isFinite(lowStockThreshold) && stockQuantity <= lowStockThreshold;

    const summaryRaw = plain.shortDescription || plain.description || '';
    const summary = summaryRaw.length > 180 ? `${summaryRaw.slice(0, 177)}...` : summaryRaw;

    return {
        id: plain.id,
        name: plain.name || 'Produto sem nome',
        slug: plain.slug,
        summary,
        priceLabel: normalizedPrice,
        compareAtLabel: compareAtPrice,
        currency: plain.currency || 'BRL',
        stockQuantity: Number.isFinite(stockQuantity) ? stockQuantity : 0,
        availability: isOutOfStock ? 'Indisponível' : isLowStock ? 'Poucas unidades' : 'Disponível',
        isOutOfStock,
        isLowStock,
        imageUrl: primaryMedia?.url || plain.metaImageUrl || null
    };
};

const buildStorefrontView = (company) => {
    const plain = toPlain(company) || {};
    const products = Array.isArray(plain.products) ? plain.products : [];
    const productCards = products.map(buildProductCard);

    const activeProducts = productCards.filter((product) => !product.isOutOfStock);
    const featuredProduct = activeProducts[0] || productCards[0] || null;

    return {
        id: plain.id,
        slug: plain.slug,
        displayName: plain.tradeName || plain.corporateName || 'Loja',
        heroSubtitle: plain.notes || 'Produtos selecionados para o seu dia a dia.',
        city: plain.city || null,
        state: plain.state || null,
        contactEmail: plain.email || null,
        contactPhone: plain.mobilePhone || plain.phone || null,
        website: plain.website || null,
        productCount: productCards.length,
        featuredProduct,
        products: productCards
    };
};

const listStores = async (req, res) => {
    try {
        const companies = await Company.findAll({
            where: { status: 'active' },
            attributes: ['id', 'slug', 'tradeName', 'corporateName', 'city', 'state', 'email', 'mobilePhone', 'phone', 'website', 'notes'],
            include: [
                {
                    model: Product,
                    as: 'products',
                    attributes: ['id'],
                    where: {
                        status: 'active',
                        visibility: 'public'
                    },
                    required: false
                }
            ],
            order: [
                ['tradeName', 'ASC'],
                ['corporateName', 'ASC']
            ]
        });

        const stores = companies
            .map((company) => buildStorefrontView(company))
            .filter((store) => store.productCount > 0)
            .map((store) => ({
                id: store.id,
                slug: store.slug,
                displayName: store.displayName,
                city: store.city,
                state: store.state,
                productCount: store.productCount,
                heroSubtitle: store.heroSubtitle
            }));

        if (wantsJson(req)) {
            return res.json({ data: stores });
        }

        res.locals.pageTitle = 'Lojas disponíveis';
        return res.render('storefront/index', {
            stores
        });
    } catch (error) {
        console.error('[storefrontController] Falha ao listar lojas:', error);
        if (wantsJson(req)) {
            return res.status(500).json({ message: 'Não foi possível carregar as lojas.' });
        }
        res.locals.pageTitle = 'Lojas';
        return res.status(500).render('storefront/not-found', {
            slug: null,
            message: 'Não foi possível carregar as lojas neste momento.'
        });
    }
};

const showStore = async (req, res) => {
    const slug = String(req.params.slug || '').trim().toLowerCase();

    if (!slug) {
        if (wantsJson(req)) {
            return res.status(400).json({ message: 'Loja inválida.' });
        }
        return res.status(404).render('storefront/not-found', { slug: null, message: 'Loja não encontrada.' });
    }

    try {
        const company = await Company.findOne({
            where: {
                slug,
                status: 'active'
            },
            include: [
                {
                    model: Product,
                    as: 'products',
                    where: {
                        status: 'active',
                        visibility: 'public'
                    },
                    required: false,
                    include: [
                        { model: ProductMedia, as: 'media', required: false }
                    ]
                }
            ],
            order: [
                [{ model: Product, as: 'products' }, 'isFeatured', 'DESC'],
                [{ model: Product, as: 'products' }, 'name', 'ASC'],
                [{ model: Product, as: 'products' }, { model: ProductMedia, as: 'media' }, 'position', 'ASC']
            ]
        });

        if (!company) {
            if (wantsJson(req)) {
                return res.status(404).json({ message: 'Loja não encontrada.' });
            }
            return res.status(404).render('storefront/not-found', { slug, message: 'Loja não encontrada.' });
        }

        const viewModel = buildStorefrontView(company);

        if (wantsJson(req)) {
            return res.json({ data: viewModel });
        }

        res.locals.pageTitle = `${viewModel.displayName} • E-commerce`;
        return res.render('storefront/show', {
            store: viewModel
        });
    } catch (error) {
        console.error('[storefrontController] Falha ao carregar loja:', error);
        if (wantsJson(req)) {
            return res.status(500).json({ message: 'Não foi possível carregar a loja.' });
        }
        return res.status(500).render('storefront/not-found', {
            slug,
            message: 'Não foi possível carregar esta loja no momento.'
        });
    }
};

module.exports = {
    listStores,
    showStore
};
