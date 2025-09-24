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

jest.mock('qrcode', () => ({
    toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=')
}), { virtual: true });

jest.setTimeout(15000);

describe('Integração PDV - fluxo completo', () => {
    let app;
    let agent;
    let operator;
    let product;

    beforeAll(async () => {
        await sequelize.sync({ force: true });
    });

    beforeEach(async () => {
        await sequelize.sync({ force: true });
        app = createRouterTestApp({ routes: [['/pos', posRoutes]] });
        operator = await User.create({
            name: 'Operador PDV',
            email: 'operador@example.com',
            password: 'SenhaSegura123',
            role: USER_ROLES.MANAGER,
            active: true
        });
        product = await Product.create({
            name: 'Sérum facial luminoso',
            sku: 'SKU-PDV-001',
            status: 'active',
            price: '120.00',
            unit: 'un',
            taxRate: '5.00',
            taxCode: '1234.56.78',
            active: true
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

    it('registra venda, itens, pagamentos e gera comprovante em PDF', async () => {
        let response = await agent.post('/pos/sales').send({
            customerName: 'Cliente Teste',
            customerTaxId: '12345678901',
            notes: 'Compra realizada no balcão.'
        });

        expect(response.status).toBe(201);
        expect(response.body.sale).toBeDefined();
        const saleId = response.body.sale.id;

        response = await agent.post(`/pos/sales/${saleId}/items`).send({
            productId: product.id,
            quantity: 2,
            unitPrice: 120,
            discountValue: 10,
            taxValue: 5
        });

        expect(response.status).toBe(201);
        expect(response.body.sale.items).toHaveLength(1);
        expect(response.body.sale.totalNet).toBeCloseTo(235);

        response = await agent.post(`/pos/sales/${saleId}/payments`).send({
            method: 'cash',
            amount: 240,
            transactionReference: 'PDV-CAIXA-01'
        });

        expect(response.status).toBe(201);
        expect(response.body.sale.totalPaid).toBeCloseTo(240);

        response = await agent.post(`/pos/sales/${saleId}/finalize`).send({});

        expect(response.status).toBe(200);
        expect(response.body.sale.status).toBe('completed');
        expect(response.body.sale.changeDue).toBeCloseTo(5);
        expect(response.body.receipt).toBeDefined();
        expect(response.body.receipt.mimeType).toBe('application/pdf');
        expect(response.body.receipt.base64.length).toBeGreaterThan(1200);

        const pdfBuffer = Buffer.from(response.body.receipt.base64, 'base64');
        expect(pdfBuffer.slice(0, 4).toString()).toBe('%PDF');

        const saleInDb = await Sale.findByPk(saleId, {
            include: [
                { model: SaleItem, as: 'items' },
                { model: SalePayment, as: 'payments' }
            ]
        });

        expect(saleInDb.status).toBe('completed');
        expect(saleInDb.payments).toHaveLength(1);
        expect(Number.parseFloat(saleInDb.changeDue)).toBeCloseTo(5);
    });

    it('busca produtos ativos para o PDV', async () => {
        const response = await agent.get('/pos/products').query({ q: 'sérum' });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.products)).toBe(true);
        expect(response.body.products[0].id).toBe(product.id);
        expect(response.body.products[0].unitPrice).toBeCloseTo(120);
    });
});
