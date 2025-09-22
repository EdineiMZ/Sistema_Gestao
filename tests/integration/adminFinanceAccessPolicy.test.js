process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const request = require('supertest');
const { USER_ROLES, ROLE_LABELS } = require('../../src/constants/roles');
const { createRouterTestApp } = require('../utils/createRouterTestApp');
const { authenticateTestUser } = require('../utils/authTestUtils');

const mockGetFinanceAccessPolicy = jest.fn();
const mockSaveFinanceAccessPolicy = jest.fn();
const mockResolveEnvFallbackRoles = jest.fn(() => ['client']);

jest.mock('../../src/services/financeAccessPolicyService', () => ({
    getFinanceAccessPolicy: (...args) => mockGetFinanceAccessPolicy(...args),
    saveFinanceAccessPolicy: (...args) => mockSaveFinanceAccessPolicy(...args),
    resolveEnvFallbackRoles: (...args) => mockResolveEnvFallbackRoles(...args),
    getAllowedRoles: jest.fn(() => Promise.resolve(['client']))
}));

const adminFinanceRoutes = require('../../src/routes/adminFinanceRoutes');

const buildApp = () => createRouterTestApp({
    routes: [['/admin/finance', adminFinanceRoutes]]
});

describe('Admin finance access policy routes', () => {
    afterEach(() => {
        jest.clearAllMocks();
        mockResolveEnvFallbackRoles.mockImplementation(() => ['client']);
    });

    it('exige autenticação para acessar a tela de política de acesso', async () => {
        mockGetFinanceAccessPolicy.mockResolvedValue({
            allowedRoles: [USER_ROLES.MANAGER],
            source: 'database',
            fallbackApplied: false
        });

        const app = buildApp();
        const response = await request(app)
            .get('/admin/finance/access-policy');

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/login');
        expect(mockGetFinanceAccessPolicy).not.toHaveBeenCalled();
    });

    it('renderiza a política atual para administradores autenticados', async () => {
        const policyResponse = {
            allowedRoles: [USER_ROLES.MANAGER, USER_ROLES.ADMIN],
            source: 'database',
            fallbackApplied: false,
            updatedByName: 'Ana Gestora',
            updatedAt: new Date('2024-10-01T12:00:00Z')
        };
        mockGetFinanceAccessPolicy.mockResolvedValue(policyResponse);
        mockResolveEnvFallbackRoles.mockReturnValue([USER_ROLES.CLIENT]);

        const app = buildApp();
        const { agent } = await authenticateTestUser(app, { role: USER_ROLES.ADMIN });
        const response = await agent.get('/admin/finance/access-policy');

        expect(response.status).toBe(200);
        expect(response.text).toContain('Perfis com acesso autorizado');
        expect(response.text).toContain(ROLE_LABELS[USER_ROLES.MANAGER]);
        expect(response.text).toContain(ROLE_LABELS[USER_ROLES.ADMIN]);
        expect(mockGetFinanceAccessPolicy).toHaveBeenCalledTimes(1);
    });

    it('não persiste quando nenhum perfil válido é enviado', async () => {
        mockGetFinanceAccessPolicy.mockResolvedValue({
            allowedRoles: [USER_ROLES.CLIENT],
            source: 'env',
            fallbackApplied: true
        });

        const app = buildApp();
        const { agent } = await authenticateTestUser(app, { role: USER_ROLES.ADMIN });

        const response = await agent
            .post('/admin/finance/access-policy')
            .send({ allowedRoles: [] });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/admin/finance/access-policy');
        expect(mockSaveFinanceAccessPolicy).not.toHaveBeenCalled();
    });

    it('persiste nova política e retorna JSON quando solicitado', async () => {
        mockGetFinanceAccessPolicy.mockResolvedValue({
            allowedRoles: [USER_ROLES.CLIENT],
            source: 'env',
            fallbackApplied: true
        });
        mockSaveFinanceAccessPolicy.mockResolvedValue({
            allowedRoles: [USER_ROLES.MANAGER, USER_ROLES.ADMIN],
            source: 'database',
            fallbackApplied: false
        });

        const app = buildApp();
        const { agent, user } = await authenticateTestUser(app, { role: USER_ROLES.ADMIN, name: 'Administrador' });

        const response = await agent
            .post('/admin/finance/access-policy')
            .set('Accept', 'application/json')
            .send({ allowedRoles: [USER_ROLES.ADMIN, USER_ROLES.MANAGER] });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            message: 'Perfis autorizados atualizados com sucesso.',
            data: { allowedRoles: [USER_ROLES.MANAGER, USER_ROLES.ADMIN] }
        });
        expect(mockSaveFinanceAccessPolicy).toHaveBeenCalledWith({
            allowedRoles: [USER_ROLES.MANAGER, USER_ROLES.ADMIN],
            updatedBy: { id: user.id, name: 'Administrador' }
        });
    });

    it('retorna erro 500 em caso de falha ao salvar', async () => {
        mockGetFinanceAccessPolicy.mockResolvedValue({
            allowedRoles: [USER_ROLES.CLIENT],
            source: 'env',
            fallbackApplied: true
        });
        mockSaveFinanceAccessPolicy.mockRejectedValue(new Error('DB indisponível'));

        const app = buildApp();
        const { agent } = await authenticateTestUser(app, { role: USER_ROLES.ADMIN });

        const response = await agent
            .post('/admin/finance/access-policy')
            .set('Accept', 'application/json')
            .send({ allowedRoles: [USER_ROLES.ADMIN] });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ message: 'Não foi possível atualizar a política financeira.' });
    });
});
