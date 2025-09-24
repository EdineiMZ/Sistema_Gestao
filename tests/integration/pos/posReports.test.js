process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const {
    sequelize,
    User,
    Product,
    Sale,
    SaleItem,
    SalePayment
} = require('../../../database/models');
const posRoutes = require('../../../src/routes/posRoutes');
const { USER_ROLES } = require('../../../src/constants/roles');
const { createRouterTestApp } = require('../../utils/createRouterTestApp');
const { authenticateTestUser } = require('../../utils/authTestUtils');

jest.setTimeout(20000);

describe('Relatórios do PDV - integração', () => {
    let app;
    let agent;
    let operator;

    const seedSales = async () => {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

        const productA = await Product.create({
            name: 'Serum facial luminoso',
            sku: 'SKU-001',
            status: 'active',
            price: '150.00',
            stockQuantity: 5,
            lowStockThreshold: 4,
            stockStatus: 'in-stock',
            allowBackorder: false
        });

        const productB = await Product.create({
            name: 'Máscara revitalizante',
            sku: 'SKU-002',
            status: 'active',
            price: '90.00',
            stockQuantity: 0,
            lowStockThreshold: 3,
            stockStatus: 'out-of-stock',
            allowBackorder: true
        });

        const saleOne = await Sale.create({
            userId: operator.id,
            status: 'completed',
            totalGross: '300.00',
            totalDiscount: '15.00',
            totalTax: '12.00',
            totalNet: '285.00',
            totalPaid: '300.00',
            changeDue: '15.00',
            openedAt: twoDaysAgo,
            closedAt: twoDaysAgo
        });

        await SaleItem.create({
            saleId: saleOne.id,
            productId: productA.id,
            productName: productA.name,
            sku: productA.sku,
            unitLabel: 'un',
            quantity: 3,
            unitPrice: '100.00',
            grossTotal: '300.00',
            discountValue: '15.00',
            taxValue: '12.00',
            netTotal: '285.00'
        });

        await SalePayment.create({
            saleId: saleOne.id,
            method: 'credit',
            amount: '300.00',
            paidAt: twoDaysAgo
        });

        const saleTwo = await Sale.create({
            userId: operator.id,
            status: 'completed',
            totalGross: '180.00',
            totalDiscount: '0.00',
            totalTax: '8.00',
            totalNet: '188.00',
            totalPaid: '188.00',
            changeDue: '0.00',
            openedAt: yesterday,
            closedAt: yesterday
        });

        await SaleItem.create({
            saleId: saleTwo.id,
            productId: productB.id,
            productName: productB.name,
            sku: productB.sku,
            unitLabel: 'un',
            quantity: 2,
            unitPrice: '90.00',
            grossTotal: '180.00',
            discountValue: '0.00',
            taxValue: '8.00',
            netTotal: '188.00'
        });

        await SalePayment.create({
            saleId: saleTwo.id,
            method: 'pix',
            amount: '188.00',
            paidAt: yesterday
        });
    };

    beforeAll(async () => {
        await sequelize.sync({ force: true });
    });

    beforeEach(async () => {
        await sequelize.sync({ force: true });
        app = createRouterTestApp({ routes: [['/pos', posRoutes]] });
        operator = await User.create({
            name: 'Operador PDV',
            email: 'operador@empresa.com',
            password: 'SenhaForte123',
            role: USER_ROLES.MANAGER,
            active: true
        });

        ({ agent } = await authenticateTestUser(app, {
            id: operator.id,
            role: operator.role,
            name: operator.name,
            email: operator.email
        }));

        await seedSales();
    });

    afterAll(async () => {
        await sequelize.close();
    });
  
    it('renderiza a página de relatórios do PDV com layout base', async () => {
        const response = await agent.get('/pos/reports');

        expect(response.status).toBe(200);
        expect(response.text).toContain('id="posReportsRoot"');
        expect(response.text).toContain('posReports.js');
    });

    it('retorna dados consolidados da visão geral', async () => {
        const response = await agent.get('/pos/reports/overview').query({ range: '30d' });

        expect(response.status).toBe(200);
        expect(response.body.totals).toBeDefined();
        expect(response.body.totals.orders).toBeGreaterThan(0);
        expect(Array.isArray(response.body.trend)).toBe(true);
        expect(Array.isArray(response.body.payments)).toBe(true);
    });

    it('consome demais rotas de relatório do PDV', async () => {
        const productsRes = await agent.get('/pos/reports/top-products').query({ range: '30d' });
        expect(productsRes.status).toBe(200);
        expect(Array.isArray(productsRes.body.items)).toBe(true);
        expect(productsRes.body.items.length).toBeGreaterThan(0);

        const hourlyRes = await agent.get('/pos/reports/movements/hourly').query({ range: '30d' });
        expect(hourlyRes.status).toBe(200);
        expect(Array.isArray(hourlyRes.body.hours)).toBe(true);
        expect(hourlyRes.body.hours).toHaveLength(24);

        const dailyRes = await agent.get('/pos/reports/movements/daily').query({ range: '30d' });
        expect(dailyRes.status).toBe(200);
        expect(Array.isArray(dailyRes.body.days)).toBe(true);
        expect(dailyRes.body.days.length).toBeGreaterThan(0);

        const stockRes = await agent.get('/pos/reports/stock');
        expect(stockRes.status).toBe(200);
        expect(stockRes.body.summary).toBeDefined();
        expect(stockRes.body.summary.totalActive).toBeGreaterThan(0);
        expect(Array.isArray(stockRes.body.items)).toBe(true);
    });
});
