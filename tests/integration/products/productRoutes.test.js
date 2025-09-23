process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const request = require('supertest');
const {
    sequelize,
    Product,
    ProductVariation,
    ProductMedia,
    ProductSupplier
} = require('../../../database/models');
const productRoutes = require('../../../src/routes/productRoutes');
const { USER_ROLES } = require('../../../src/constants/roles');
const { createRouterTestApp } = require('../../utils/createRouterTestApp');
const { authenticateTestUser } = require('../../utils/authTestUtils');

const basePayload = {
    name: 'Produto Smart',
    slug: 'produto-smart',
    sku: 'SKU-001',
    status: 'active',
    visibility: 'public',
    description: 'Descrição detalhada do produto inteligente.',
    shortDescription: 'Resumo do produto.',
    price: '199.90',
    costPrice: '120.45',
    compareAtPrice: '249.90',
    currency: 'BRL',
    discountType: 'percentage',
    discountValue: '10',
    stockQuantity: '25',
    stockStatus: 'in-stock',
    allowBackorder: true,
    taxIncluded: true,
    taxRate: '12',
    weight: '1.25',
    weightUnit: 'kg',
    length: '25',
    width: '15',
    height: '8',
    dimensionsUnit: 'cm',
    requiresShipping: true,
    deliveryTimeMin: '2',
    deliveryTimeMax: '5',
    tags: 'tecnologia,smart',
    seoTitle: 'Produto Smart - Melhor escolha',
    seoDescription: 'Otimize suas vendas com o Produto Smart.',
    releaseDate: '2024-01-15',
    isFeatured: true,
    variations: [
        {
            name: 'Preto / 64GB',
            sku: 'SKU-001-64',
            stockQuantity: '10',
            price: '209.90',
            costPrice: '130.00',
            weight: '1.2',
            attributes: JSON.stringify({ cor: 'preto', armazenamento: '64GB' })
        }
    ],
    media: [
        {
            type: 'image',
            url: 'https://cdn.example.com/produto-smart.png',
            position: '1',
            altText: 'Produto smart em destaque',
            isPrimary: true
        }
    ],
    suppliers: [
        {
            supplierName: 'Fornecedor Oficial',
            supplierSku: 'FORN-001',
            supplierPrice: '100.00',
            leadTimeDays: '3',
            minimumOrderQuantity: '5',
            contactEmail: 'contato@fornecedor.com',
            contactPhone: '11999999999',
            isPreferred: true
        }
    ]
};

const buildApp = () => createRouterTestApp({ routes: [['/products', productRoutes]] });

const createProductViaApi = async (agent, overrides = {}) => {
    const payload = {
        ...basePayload,
        name: overrides.name || basePayload.name,
        slug: overrides.slug || basePayload.slug,
        ...overrides
    };

    const response = await agent
        .post('/products')
        .set('Accept', 'application/json')
        .send(payload);

    return response;
};

describe('Rotas de produtos', () => {
    let app;

    beforeAll(async () => {
        app = buildApp();
        await sequelize.sync({ force: true });
    });

    beforeEach(async () => {
        await sequelize.sync({ force: true });
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('exige autenticação para acessar a listagem', async () => {
        const response = await request(app)
            .get('/products')
            .set('Accept', 'application/json');

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/login');
    });

    it('cria um produto completo com variações, mídias e fornecedores', async () => {
        const { agent } = await authenticateTestUser(app, { role: USER_ROLES.MANAGER });

        const response = await createProductViaApi(agent);

        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
            name: basePayload.name,
            status: 'active',
            currency: 'BRL',
            stockQuantity: 25,
            variations: expect.any(Array),
            media: expect.any(Array),
            suppliers: expect.any(Array)
        });

        const productRecord = await Product.findOne({ where: { slug: basePayload.slug }, include: ['variations', 'media', 'suppliers'] });
        expect(productRecord).not.toBeNull();
        expect(productRecord.variations).toHaveLength(1);
        expect(productRecord.media).toHaveLength(1);
        expect(productRecord.suppliers).toHaveLength(1);
    });

    it('lista os produtos cadastrados com resumo financeiro', async () => {
        const { agent } = await authenticateTestUser(app, { role: USER_ROLES.MANAGER });
        await createProductViaApi(agent, { slug: 'produto-smart-2', sku: 'SKU-002', name: 'Produto Smart 2' });

        const response = await agent
            .get('/products')
            .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data[0]).toMatchObject({
            name: expect.any(String),
            price: expect.any(Number),
            stockQuantity: expect.any(Number)
        });
    });

    it('atualiza um produto substituindo registros relacionados', async () => {
        const { agent } = await authenticateTestUser(app, { role: USER_ROLES.MANAGER });
        const creationResponse = await createProductViaApi(agent);
        const productId = creationResponse.body.data.id;

        const updatePayload = {
            ...basePayload,
            name: 'Produto Smart Atualizado',
            slug: 'produto-smart-atualizado',
            price: '299.90',
            stockQuantity: '5',
            variations: [
                {
                    name: 'Branco / 128GB',
                    sku: 'SKU-001-128',
                    stockQuantity: '2',
                    price: '329.90',
                    attributes: JSON.stringify({ cor: 'branco', armazenamento: '128GB' })
                }
            ],
            suppliers: [
                {
                    supplierName: 'Fornecedor Especialista',
                    supplierPrice: '180.00',
                    leadTimeDays: '7',
                    contactEmail: 'especialista@fornecedor.com',
                    isPreferred: false
                }
            ],
            media: [
                {
                    type: 'image',
                    url: 'https://cdn.example.com/produto-smart-v2.png',
                    position: '1',
                    altText: 'Produto atualizado'
                }
            ]
        };

        const response = await agent
            .put(`/products/${productId}`)
            .set('Accept', 'application/json')
            .send(updatePayload);

        expect(response.status).toBe(200);
        expect(response.body.data.name).toBe('Produto Smart Atualizado');
        expect(response.body.data.variations).toHaveLength(1);
        expect(response.body.data.suppliers).toHaveLength(1);
        expect(response.body.data.media).toHaveLength(1);

        const variationsCount = await ProductVariation.count({ where: { productId } });
        expect(variationsCount).toBe(1);

        const supplier = await ProductSupplier.findOne({ where: { productId } });
        expect(supplier.supplierName).toBe('Fornecedor Especialista');
    });

    it('exclui um produto e remove registros relacionados', async () => {
        const { agent } = await authenticateTestUser(app, { role: USER_ROLES.MANAGER });
        const creationResponse = await createProductViaApi(agent, { slug: 'produto-para-excluir', sku: 'SKU-DELETE' });
        const productId = creationResponse.body.data.id;

        const deleteResponse = await agent
            .delete(`/products/${productId}`)
            .set('Accept', 'application/json');

        expect(deleteResponse.status).toBe(204);

        const productExists = await Product.findByPk(productId);
        expect(productExists).toBeNull();

        const relatedCounts = await Promise.all([
            ProductVariation.count({ where: { productId } }),
            ProductMedia.count({ where: { productId } }),
            ProductSupplier.count({ where: { productId } })
        ]);

        relatedCounts.forEach((count) => expect(count).toBe(0));
    });
});
