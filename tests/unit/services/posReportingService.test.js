process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const {
    sequelize,
    User,
    Product,
    Sale,
    SaleItem,
    Company
} = require('../../../database/models');
const {
    getTopProducts,
    getTrafficReport,
    getInventoryReport,
    resolveRange,
    buildLimit,
    DEFAULT_INVENTORY_LIMIT,
    MAX_INVENTORY_LIMIT
} = require('../../../src/services/posReportingService');

const createOperator = (companyId) => User.create({
    name: 'Operador Teste',
    email: 'operador+teste@example.com',
    password: 'SenhaSegura123',
    role: 'manager',
    active: true,
    companyId
});

const createProduct = (companyId, overrides = {}) => Product.create({
    name: 'Produto Base',
    sku: `SKU-${Math.random().toString(16).slice(2, 8)}`,
    status: 'active',
    price: '50.00',
    stockQuantity: 20,
    lowStockThreshold: 5,
    companyId,
    ...overrides
});

describe('posReportingService', () => {
    let company;
    let operator;
    let productA;
    let productB;

    beforeAll(async () => {
        await sequelize.sync({ force: true });
    });

    beforeEach(async () => {
        await sequelize.sync({ force: true });
        company = await Company.create({
            cnpj: '77888999000166',
            corporateName: 'Relatorios Inteligentes LTDA',
            tradeName: 'Relatórios Inteligentes'
        });
        operator = await createOperator(company.id);
        productA = await createProduct(company.id, { name: 'Produto A', price: '80.00', stockQuantity: 3 });
        productB = await createProduct(company.id, { name: 'Produto B', price: '40.00', stockQuantity: 12, lowStockThreshold: 10 });

        const sale1 = await Sale.create({
            userId: operator.id,
            status: 'completed',
            totalGross: '200.00',
            totalNet: '180.00',
            totalPaid: '180.00',
            openedAt: new Date('2024-05-01T12:15:00Z'),
            closedAt: new Date('2024-05-01T12:45:00Z')
        });

        const sale2 = await Sale.create({
            userId: operator.id,
            status: 'completed',
            totalGross: '90.00',
            totalNet: '90.00',
            totalPaid: '90.00',
            openedAt: new Date('2024-05-02T18:00:00Z'),
            closedAt: new Date('2024-05-02T18:20:00Z')
        });

        await SaleItem.bulkCreate([
            {
                saleId: sale1.id,
                productId: productA.id,
                productName: productA.name,
                sku: productA.sku,
                quantity: '2.000',
                unitPrice: '80.00',
                grossTotal: '160.00',
                discountValue: '10.00',
                netTotal: '150.00'
            },
            {
                saleId: sale1.id,
                productId: productB.id,
                productName: productB.name,
                sku: productB.sku,
                quantity: '1.000',
                unitPrice: '40.00',
                grossTotal: '40.00',
                discountValue: '0.00',
                netTotal: '30.00'
            },
            {
                saleId: sale2.id,
                productId: productB.id,
                productName: productB.name,
                sku: productB.sku,
                quantity: '3.000',
                unitPrice: '30.00',
                grossTotal: '90.00',
                discountValue: '0.00',
                netTotal: '90.00'
            }
        ]);

        await Sale.create({
            userId: operator.id,
            status: 'completed',
            totalGross: '120.00',
            totalNet: '120.00',
            totalPaid: '120.00',
            openedAt: new Date('2023-12-01T09:00:00Z'),
            closedAt: new Date('2023-12-01T09:30:00Z')
        });
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('gera ranking de produtos por quantidade e receita dentro do período', async () => {
        const report = await getTopProducts({
            start: new Date('2024-05-01T00:00:00Z'),
            end: new Date('2024-05-03T23:59:59Z'),
            limit: 5
        });

        expect(report.limit).toBe(5);
        expect(report.byQuantity).toHaveLength(2);
        expect(report.byQuantity[0].name).toBe('Produto B');
        expect(report.byQuantity[0].totalQuantity).toBeCloseTo(4, 3);
        expect(report.byRevenue[0].name).toBe('Produto A');
        expect(report.byRevenue[0].totalRevenue).toBeCloseTo(150, 2);
    });

    it('calcula horários e dias de maior movimento', async () => {
        const report = await getTrafficReport({
            start: new Date('2024-05-01T00:00:00Z'),
            end: new Date('2024-05-03T23:59:59Z')
        });

        expect(report.totals.salesCount).toBeGreaterThanOrEqual(2);
        expect(report.byHour.some((entry) => entry.hour === '12:00')).toBe(true);
        expect(report.byDay.find((entry) => entry.day === '2024-05-01')).toBeDefined();
    });

    it('identifica produtos com estoque baixo', async () => {
        const report = await getInventoryReport({ limit: 10 });
        expect(report.limit).toBe(10);
        const alert = report.lowStockAlerts.find((item) => item.productId === productA.id);
        expect(alert).toBeDefined();
        const productBItem = report.items.find((item) => item.productId === productB.id);
        expect(productBItem.lowStock).toBe(false);
    });

    it('limita intervalo máximo no resolveRange', () => {
        const now = new Date('2024-07-01T00:00:00Z');
        const start = new Date(now.getTime() - (400 * 86400000));

        const range = resolveRange({ start, end: now });
        const diffDays = Math.round((range.end - range.start) / 86400000);
        expect(diffDays).toBeLessThanOrEqual(180);
    });

    it('clampa limites personalizados', () => {
        expect(buildLimit('abc')).toBe(10);
        expect(buildLimit(999)).toBe(50);
        expect(buildLimit(2)).toBe(2);
        expect(buildLimit(500, { defaultValue: DEFAULT_INVENTORY_LIMIT, maxValue: MAX_INVENTORY_LIMIT })).toBe(MAX_INVENTORY_LIMIT);
    });
});
