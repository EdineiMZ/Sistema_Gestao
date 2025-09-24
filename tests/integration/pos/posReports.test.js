process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const {
    sequelize,
    User,
    Product,
    Sale,
    SaleItem
} = require('../../../database/models');
const posRoutes = require('../../../src/routes/posRoutes');
const { USER_ROLES } = require('../../../src/constants/roles');
const { createRouterTestApp } = require('../../utils/createRouterTestApp');
const { authenticateTestUser } = require('../../utils/authTestUtils');

jest.mock('qrcode', () => ({
    toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=')
}), { virtual: true });

jest.setTimeout(20000);

describe('Integração PDV - relatórios', () => {
    let app;
    let agent;
    let operator;
    let productA;
    let productB;

    beforeAll(async () => {
        await sequelize.sync({ force: true });
    });

    beforeEach(async () => {
        await sequelize.sync({ force: true });
        app = createRouterTestApp({ routes: [['/pos', posRoutes]] });
        operator = await User.create({
            name: 'Operador PDV',
            email: 'operador.relatorios@example.com',
            password: 'SenhaSegura123',
            role: USER_ROLES.MANAGER,
            active: true
        });

        productA = await Product.create({
            name: 'Vitamina C Serum',
            sku: 'SKU-REL-001',
            status: 'active',
            price: '120.00',
            stockQuantity: 2,
            lowStockThreshold: 3
        });

        productB = await Product.create({
            name: 'Hidratante Facial',
            sku: 'SKU-REL-002',
            status: 'active',
            price: '80.00',
            stockQuantity: 15,
            lowStockThreshold: 5
        });

        const sale1 = await Sale.create({
            userId: operator.id,
            status: 'completed',
            totalGross: '200.00',
            totalNet: '180.00',
            totalPaid: '180.00',
            openedAt: new Date('2024-05-05T14:15:00Z'),
            closedAt: new Date('2024-05-05T14:30:00Z')
        });

        const sale2 = await Sale.create({
            userId: operator.id,
            status: 'completed',
            totalGross: '160.00',
            totalNet: '160.00',
            totalPaid: '160.00',
            openedAt: new Date('2024-05-06T10:00:00Z'),
            closedAt: new Date('2024-05-06T10:10:00Z')
        });

        await SaleItem.bulkCreate([
            {
                saleId: sale1.id,
                productId: productA.id,
                productName: productA.name,
                sku: productA.sku,
                quantity: '1.000',
                unitPrice: '120.00',
                grossTotal: '120.00',
                discountValue: '0.00',
                netTotal: '120.00'
            },
            {
                saleId: sale1.id,
                productId: productB.id,
                productName: productB.name,
                sku: productB.sku,
                quantity: '2.000',
                unitPrice: '40.00',
                grossTotal: '80.00',
                discountValue: '20.00',
                netTotal: '60.00'
            },
            {
                saleId: sale2.id,
                productId: productB.id,
                productName: productB.name,
                sku: productB.sku,
                quantity: '3.000',
                unitPrice: '40.00',
                grossTotal: '120.00',
                discountValue: '0.00',
                netTotal: '120.00'
            }
        ]);

        await Sale.create({
            userId: operator.id,
            status: 'completed',
            totalGross: '50.00',
            totalNet: '50.00',
            totalPaid: '50.00',
            openedAt: new Date('2023-10-01T09:00:00Z'),
            closedAt: new Date('2023-10-01T09:20:00Z')
        });

        ({ agent } = await authenticateTestUser(app, {
            id: operator.id,
            role: operator.role,
            name: operator.name,
            email: operator.email
        }));
    });

    afterAll(async () => {
        await sequelize.close();
    });

    const defaultQuery = {
        startDate: '2024-05-01',
        endDate: '2024-05-10'
    };

    it('retorna visão consolidada de relatórios do PDV', async () => {
        const response = await agent.get('/pos/reports').query(defaultQuery);

        expect(response.status).toBe(200);
        expect(response.body.topProducts).toBeDefined();
        expect(response.body.traffic).toBeDefined();
        expect(response.body.inventory).toBeDefined();
        expect(response.body.topProducts.byQuantity[0].productId).toBe(productB.id);
        expect(response.body.inventory.lowStockAlerts[0].productId).toBe(productA.id);
        expect(response.body.metadata.maxLimit).toBeGreaterThan(0);
    });

    it('filtra ranking de produtos com limite personalizado', async () => {
        const response = await agent
            .get('/pos/reports/top-products')
            .query({ ...defaultQuery, limit: 1 });

        expect(response.status).toBe(200);
        expect(response.body.report.limit).toBe(1);
        expect(response.body.report.byQuantity).toHaveLength(1);
        expect(response.body.report.byRevenue[0].productId).toBe(productB.id);
    });

    it('retorna horários e dias de maior movimento', async () => {
        const response = await agent
            .get('/pos/reports/traffic')
            .query(defaultQuery);

        expect(response.status).toBe(200);
        expect(response.body.report.byHour.length).toBeGreaterThan(0);
        expect(response.body.report.byDay.some((entry) => entry.day === '2024-05-05')).toBe(true);
    });

    it('controla limite de itens no relatório de estoque', async () => {
        const response = await agent
            .get('/pos/reports/inventory')
            .query({ inventoryLimit: 1 });

        expect(response.status).toBe(200);
        expect(response.body.report.items).toHaveLength(1);
        expect(response.body.report.items[0].productId).toBe(productA.id);
        expect(response.body.metadata.maxLimit).toBeGreaterThan(0);
    });

    it('rejeita datas inválidas e protege contra injeção', async () => {
        const maliciousDate = "2024-05-01'; DROP TABLE SaleItems; --";
        const response = await agent
            .get('/pos/reports')
            .query({ startDate: maliciousDate, endDate: defaultQuery.endDate });

        expect(response.status).toBe(400);
        expect(response.body.message).toMatch(/Data inicial inválida/i);
        const itemCount = await SaleItem.count();
        expect(itemCount).toBeGreaterThan(0);
    });

    it('impõe máximo de limite configurado', async () => {
        const response = await agent
            .get('/pos/reports/top-products')
            .query({ ...defaultQuery, limit: 999 });

        expect(response.status).toBe(200);
        expect(response.body.report.limit).toBeLessThanOrEqual(50);
    });
});
