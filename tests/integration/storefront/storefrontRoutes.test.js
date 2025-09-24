process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const request = require('supertest');
const {
    sequelize,
    Company,
    Product
} = require('../../../database/models');
const storeRoutes = require('../../../src/routes/storeRoutes');
const { createRouterTestApp } = require('../../utils/createRouterTestApp');

const buildApp = () => createRouterTestApp({ routes: [['/store', storeRoutes]] });

describe('Storefront público', () => {
    let app;
    let company;

    beforeAll(async () => {
        await sequelize.sync({ force: true });
    });

    beforeEach(async () => {
        await sequelize.sync({ force: true });
        app = buildApp();
        company = await Company.create({
            cnpj: '99888777000155',
            corporateName: 'Aurora Cosméticos LTDA',
            tradeName: 'Aurora Beleza',
            email: 'contato@aurorabeleza.com',
            notes: 'Produtos veganos e cruelty free.'
        });

        await Product.create({
            companyId: company.id,
            name: 'Hidratante Facial Aurora',
            slug: 'hidratante-facial-aurora',
            status: 'active',
            visibility: 'public',
            price: '129.90',
            stockQuantity: 12,
            shortDescription: 'Textura leve com ácido hialurônico.',
            isFeatured: true
        });
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('lista lojas com produtos ativos', async () => {
        const response = await request(app).get('/store');

        expect(response.status).toBe(200);
        expect(response.text).toContain('Aurora Beleza');
        expect(response.text).toContain('produtos atualizados');
    });

    it('exibe a vitrine da loja com produtos', async () => {
        const response = await request(app).get(`/store/${company.slug}`);

        expect(response.status).toBe(200);
        expect(response.text).toContain('Aurora Beleza');
        expect(response.text).toContain('Hidratante Facial Aurora');
    });

    it('retorna representação JSON da loja', async () => {
        const response = await request(app)
            .get(`/store/${company.slug}`)
            .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
            slug: company.slug,
            displayName: 'Aurora Beleza',
            products: expect.any(Array)
        });
    });
});
