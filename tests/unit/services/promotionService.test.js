process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const {
    sequelize,
    Product,
    Promotion
} = require('../../../database/models');
const {
    createPromotion,
    applyPromotionsToProducts,
    buildPromotionPayload
} = require('../../../src/services/promotionService');

const createProduct = (overrides = {}) => Product.create({
    name: 'Produto Promocional',
    sku: `PROMO-${Math.random().toString(16).slice(2, 8)}`,
    status: 'active',
    price: '100.00',
    unitPrice: '100.00',
    brand: 'TechBrand',
    category: 'eletronicos',
    taxRate: 12,
    ...overrides
});

describe('promotionService', () => {
    beforeAll(async () => {
        await sequelize.sync({ force: true });
    });

    beforeEach(async () => {
        await Promotion.destroy({ where: {} });
        await Product.destroy({ where: {} });
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('aplica a melhor promoção disponível considerando escopos diferentes', async () => {
        const product = await createProduct();

        await createPromotion({
            name: 'Campanha Loja',
            type: 'store',
            discountType: 'percentage',
            discountValue: '5',
            isActive: true
        });

        await createPromotion({
            name: 'Campanha Marca',
            type: 'brand',
            targetBrand: 'TechBrand',
            discountType: 'fixed',
            discountValue: '10',
            isActive: true
        });

        await createPromotion({
            name: 'Campanha Produto',
            type: 'product',
            targetProductId: product.id,
            discountType: 'percentage',
            discountValue: '20',
            isActive: true
        });

        const [enriched] = await applyPromotionsToProducts([product]);

        expect(enriched.finalPrice).toBeCloseTo(80, 2);
        expect(enriched.promotion).toBeDefined();
        expect(enriched.promotion.name).toBe('Campanha Produto');
        expect(enriched.discountAmount).toBeCloseTo(20, 2);
    });

    it('ignora promoções fora do período configurado', async () => {
        const product = await createProduct({ brand: 'FutureBrand', category: 'lancamentos' });
        const now = new Date();
        const yesterday = new Date(now.getTime() - 86400000);
        const tomorrow = new Date(now.getTime() + 86400000);

        await createPromotion({
            name: 'Promoção Expirada',
            type: 'brand',
            targetBrand: 'FutureBrand',
            discountType: 'fixed',
            discountValue: '50',
            startDate: new Date(now.getTime() - 7 * 86400000).toISOString(),
            endDate: yesterday.toISOString(),
            isActive: true
        });

        await createPromotion({
            name: 'Promoção Programada',
            type: 'category',
            targetCategory: 'lancamentos',
            discountType: 'percentage',
            discountValue: '25',
            startDate: tomorrow.toISOString(),
            endDate: new Date(now.getTime() + 2 * 86400000).toISOString(),
            isActive: true
        });

        await createPromotion({
            name: 'Promoção Ativa',
            type: 'store',
            discountType: 'percentage',
            discountValue: '10',
            isActive: true
        });

        const [enriched] = await applyPromotionsToProducts([product]);

        expect(enriched.finalPrice).toBeCloseTo(90, 2);
        expect(enriched.promotion).toBeDefined();
        expect(enriched.promotion.name).toBe('Promoção Ativa');
    });

    it('valida limites de desconto percentual ao montar payload', () => {
        expect(() => buildPromotionPayload({
            name: 'Promoção inválida',
            type: 'store',
            discountType: 'percentage',
            discountValue: '150'
        })).toThrow('Descontos percentuais não podem ser superiores a 100%.');
    });
});
