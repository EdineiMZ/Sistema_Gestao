const paymentTokenService = require('../../../src/services/paymentTokenService');
const models = require('../../../database/models');

const { PaymentGatewayToken, Company } = models;

describe('paymentTokenService', () => {
    const SECRET = 'super-secure-secret-value-with-length';

    beforeEach(() => {
        process.env.PAYMENT_TOKEN_SECRET = SECRET;
    });

    afterEach(() => {
        delete process.env.PAYMENT_TOKEN_SECRET;
        jest.restoreAllMocks();
    });

    it('normaliza segmentos ao construir a chave de integração', () => {
        const key = paymentTokenService.buildIntegrationKey({
            cnpj: '12.345.678/0001-99',
            apiName: 'Mercado Pago',
            bankName: 'Banco do Brasil'
        });

        expect(key).toBe('12345678000199_MERCADO_PAGO_BANCO_DO_BRASIL');
    });

    it('salva novo token criptografado no banco de dados', async () => {
        const mockDate = new Date('2024-05-05T12:00:00Z');

        jest.spyOn(Company, 'findByPk').mockResolvedValue({ id: 1, cnpj: '12.345.678/0001-99' });
        jest.spyOn(PaymentGatewayToken, 'findOne').mockResolvedValue(null);

        const createSpy = jest.spyOn(PaymentGatewayToken, 'create').mockImplementation(async (payload) => ({
            ...payload,
            id: 42,
            updatedAt: mockDate,
            get: ({ plain }) => (plain ? { ...payload, id: 42, updatedAt: mockDate } : null)
        }));

        const result = await paymentTokenService.saveToken({
            companyId: 1,
            apiName: 'Mercado Pago',
            bankName: 'Itaú',
            provider: 'Mercado Pago',
            token: 'mp-token-12345'
        });

        expect(PaymentGatewayToken.findOne).toHaveBeenCalledWith({
            where: {
                companyId: 1,
                apiName: 'MERCADO_PAGO',
                bankName: 'ITAU'
            }
        });

        expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
            companyId: 1,
            companyCnpj: '12345678000199',
            provider: 'MERCADO_PAGO',
            apiName: 'MERCADO_PAGO',
            bankName: 'ITAU',
            integrationKey: '12345678000199_MERCADO_PAGO_ITAU',
            tokenPreview: '••••2345'
        }));

        const createdPayload = createSpy.mock.calls[0][0];
        expect(createdPayload.encryptedToken).toBeDefined();
        expect(createdPayload.encryptedToken).not.toContain('mp-token-12345');
        expect(createdPayload.encryptionIv).toBeDefined();
        expect(createdPayload.encryptionAuthTag).toBeDefined();

        expect(result).toEqual({
            id: 42,
            provider: 'MERCADO_PAGO',
            apiName: 'MERCADO_PAGO',
            bankName: 'ITAU',
            integrationKey: '12345678000199_MERCADO_PAGO_ITAU',
            preview: '••••2345',
            updatedAt: mockDate,
            source: 'database'
        });
    });

    it('prioriza token configurado em variável de ambiente', async () => {
        jest.spyOn(Company, 'findByPk').mockResolvedValue({ id: 5, cnpj: '83.142.911/0001-70' });
        jest.spyOn(PaymentGatewayToken, 'findOne').mockResolvedValue(null);

        const integrationKey = '83142911000170_GOOGLE_PAY_NUBANK';
        process.env[integrationKey] = 'env-google-token';

        const token = await paymentTokenService.getToken({
            companyId: 5,
            apiName: 'Google Pay',
            bankName: 'Nubank'
        });

        expect(token).toEqual({
            token: 'env-google-token',
            source: 'env',
            integrationKey
        });

        delete process.env[integrationKey];
    });

    it('recupera token criptografado do banco quando não há override no ambiente', async () => {
        const company = { id: 9, cnpj: '63.321.111/0001-22' };
        jest.spyOn(Company, 'findByPk').mockResolvedValue(company);

        const integrationKey = '63321111000122_STRIPE_BRADESCO';
        const encrypted = paymentTokenService.__testing.encryptToken('stripe-secret', '63321111000122');

        jest.spyOn(PaymentGatewayToken, 'findOne').mockResolvedValue({
            ...encrypted,
            companyId: 9,
            apiName: 'STRIPE',
            bankName: 'BRADESCO'
        });

        const token = await paymentTokenService.getToken({
            companyId: 9,
            apiName: 'Stripe',
            bankName: 'Bradesco'
        });

        expect(token).toEqual({
            token: 'stripe-secret',
            source: 'database',
            integrationKey
        });
    });

    it('lista tokens existentes destacando fonte ativa', async () => {
        const company = { id: 3, cnpj: '11.222.333/0001-44' };
        jest.spyOn(Company, 'findByPk').mockResolvedValue(company);

        const firstIntegration = '11222333000144_MERCADO_PAGO_ITAU';
        const secondIntegration = '11222333000144_PIX_CAIXA';
        process.env[firstIntegration] = 'env-override';

        const records = [
            {
                get: ({ plain }) =>
                    plain
                        ? {
                              id: 1,
                              provider: 'MERCADO_PAGO',
                              apiName: 'MERCADO_PAGO',
                              bankName: 'ITAU',
                              integrationKey: firstIntegration,
                              tokenPreview: '••••9999',
                              updatedAt: new Date('2024-06-01T10:00:00Z')
                          }
                        : null
            },
            {
                get: ({ plain }) =>
                    plain
                        ? {
                              id: 2,
                              provider: 'PIX',
                              apiName: 'PIX',
                              bankName: 'CAIXA',
                              integrationKey: secondIntegration,
                              tokenPreview: '••••1234',
                              updatedAt: new Date('2024-05-25T08:30:00Z')
                          }
                        : null
            }
        ];

        jest.spyOn(PaymentGatewayToken, 'findAll').mockResolvedValue(records);

        const tokens = await paymentTokenService.listTokens(3);

        expect(tokens).toEqual([
            {
                id: 1,
                provider: 'MERCADO_PAGO',
                apiName: 'MERCADO_PAGO',
                bankName: 'ITAU',
                integrationKey: firstIntegration,
                preview: '••••9999',
                updatedAt: new Date('2024-06-01T10:00:00Z'),
                source: 'env'
            },
            {
                id: 2,
                provider: 'PIX',
                apiName: 'PIX',
                bankName: 'CAIXA',
                integrationKey: secondIntegration,
                preview: '••••1234',
                updatedAt: new Date('2024-05-25T08:30:00Z'),
                source: 'database'
            }
        ]);

        delete process.env[firstIntegration];
    });
});
