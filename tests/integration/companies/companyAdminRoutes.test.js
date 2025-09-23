process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const mockTransaction = jest.fn(async (callback) => callback({}));

jest.mock('../../../database/models', () => ({
    Company: {
        findAll: jest.fn(),
        create: jest.fn(),
        findByPk: jest.fn()
    },
    User: {
        findAll: jest.fn(),
        findByPk: jest.fn()
    },
    sequelize: {
        transaction: mockTransaction,
        getDialect: () => 'sqlite'
    }
}));

jest.mock('../../../src/services/companyLookup', () => {
    class MockCompanyLookupError extends Error {
        constructor(message, { status = 500, code = 'ERROR' } = {}) {
            super(message);
            this.name = 'CompanyLookupError';
            this.status = status;
            this.code = code;
        }
    }

    return {
        lookupCompanyByCnpj: jest.fn(),
        CompanyLookupError: MockCompanyLookupError
    };
});

const { Company, User } = require('../../../database/models');
const { lookupCompanyByCnpj } = require('../../../src/services/companyLookup');
const { createRouterTestApp } = require('../../utils/createRouterTestApp');
const { authenticateTestUser } = require('../../utils/authTestUtils');
const companyRoutes = require('../../../src/routes/companyRoutes');

const buildAgent = async () => {
    const app = createRouterTestApp({ routes: [['/admin/companies', companyRoutes]] });
    const { agent } = await authenticateTestUser(app, { role: 'Admin' });
    return agent;
};

describe('Rotas administrativas de empresas', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('permite cadastro manual de uma nova empresa', async () => {
        Company.create.mockResolvedValueOnce({ id: 10 });

        const agent = await buildAgent();
        const response = await agent.post('/admin/companies').send({
            cnpj: '12.345.678/0001-99',
            corporateName: 'Empresa Exemplo Ltda',
            tradeName: 'Empresa Exemplo',
            email: 'contato@empresa.com',
            phone: '1133224455',
            status: 'active'
        });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/admin/companies');
        expect(Company.create).toHaveBeenCalledWith(
            expect.objectContaining({
                cnpj: '12345678000199',
                corporateName: 'Empresa Exemplo Ltda',
                tradeName: 'Empresa Exemplo',
                email: 'contato@empresa.com',
                phone: '1133224455',
                status: 'active'
            })
        );
    });

    it('retorna dados preenchidos automaticamente via API', async () => {
        lookupCompanyByCnpj.mockResolvedValueOnce({
            cnpj: '12345678000199',
            corporateName: 'Empresa API SA',
            tradeName: 'Empresa API'
        });

        const agent = await buildAgent();
        const response = await agent
            .post('/admin/companies/lookup')
            .send({ cnpj: '12.345.678/0001-99' })
            .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            success: true,
            data: {
                cnpj: '12345678000199',
                corporateName: 'Empresa API SA',
                tradeName: 'Empresa API'
            }
        });
        expect(lookupCompanyByCnpj).toHaveBeenCalledWith('12.345.678/0001-99', { forceRefresh: false });
    });

    it('vincula usuário a uma empresa existente', async () => {
        const companyInstance = { id: 77, get: jest.fn(() => ({ id: 77 })) };
        const userInstance = { id: 999, update: jest.fn().mockResolvedValue(undefined) };

        Company.findByPk.mockResolvedValue(companyInstance);
        User.findByPk.mockResolvedValue(userInstance);

        const agent = await buildAgent();
        const response = await agent
            .post('/admin/companies/77/users')
            .send({ userId: 999, accessLevel: 'manager' });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/admin/companies/77/users');
        expect(mockTransaction).toHaveBeenCalled();
        expect(userInstance.update).toHaveBeenCalledWith(
            { companyId: 77, companyAccessLevel: 'manager' },
            expect.any(Object)
        );
    });
});
