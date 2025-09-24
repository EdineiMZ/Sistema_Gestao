process.env.NODE_ENV = 'test';

const { USER_ROLES } = require('../../src/constants/roles');
const { createRouterTestApp } = require('../utils/createRouterTestApp');
const { authenticateTestUser } = require('../utils/authTestUtils');

const mockGetAllowedRoles = jest.fn(() => Promise.resolve([USER_ROLES.MANAGER, USER_ROLES.ADMIN]));
const mockResolveEnvFallbackRoles = jest.fn(() => [USER_ROLES.MANAGER, USER_ROLES.ADMIN]);

const buildFinanceRoutes = () => {
    jest.resetModules();

    jest.doMock('../../src/controllers/financeController', () => ({
        redirectToOverview: jest.fn((req, res) => res.json({ redirect: '/finance/overview' })),
        renderOverview: jest.fn((req, res) => res.send('overview')),
        renderBudgetsPage: jest.fn((req, res) => res.send('budgets')),
        renderPaymentsPage: jest.fn((req, res) => res.send('payments')),
        renderInvestmentsPage: jest.fn((req, res) => res.send('investments')),
        previewFinanceImport: jest.fn((req, res) => res.json({ ok: true, route: 'finance.preview' })),
        commitFinanceImport: jest.fn((req, res) => res.status(201).json({ ok: true, route: 'finance.commit' })),
        createFinanceEntry: jest.fn((req, res) => res.status(201).json({ ok: true, route: 'finance.create' })),
        updateFinanceEntry: jest.fn((req, res) => res.json({ ok: true, route: 'finance.update', id: req.params.id })),
        deleteFinanceEntry: jest.fn((req, res) => res.status(204).end()),
        updateBudgetThresholds: jest.fn((req, res) => res.json({ ok: true, route: 'finance.thresholds' })),
        saveFinanceGoal: jest.fn((req, res) => res.json({ ok: true, route: 'finance.goal.save' })),
        deleteFinanceGoal: jest.fn((req, res) => res.status(204).end()),
        exportPdf: jest.fn((req, res) => res.json({ ok: true, route: 'finance.export.pdf' })),
        exportExcel: jest.fn((req, res) => res.json({ ok: true, route: 'finance.export.excel' })),
        downloadAttachment: jest.fn((req, res) => res.json({ ok: true, route: 'finance.attachment.download' }))
    }));

    jest.doMock('../../src/controllers/budgetController', () => ({
        save: jest.fn((req, res) => res.json({ ok: true, route: 'budget.save' })),
        delete: jest.fn((req, res) => res.json({ ok: true, route: 'budget.delete' }))
    }));

    jest.doMock('../../src/services/financeAccessPolicyService', () => ({
        getAllowedRoles: mockGetAllowedRoles,
        resolveEnvFallbackRoles: mockResolveEnvFallbackRoles
    }));

    return require('../../src/routes/financeRoutes');
};

const buildTestApp = () => {
    const financeRoutes = buildFinanceRoutes();
    return createRouterTestApp({ routes: [['/finance', financeRoutes]] });
};

describe('Finance routes permissions', () => {
    const originalAllowedRoles = process.env.FINANCE_ALLOWED_ROLES;

    afterEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        mockGetAllowedRoles.mockReset();
        mockResolveEnvFallbackRoles.mockReset();
        mockGetAllowedRoles.mockImplementation(() => Promise.resolve([USER_ROLES.MANAGER, USER_ROLES.ADMIN]));
        mockResolveEnvFallbackRoles.mockImplementation(() => [USER_ROLES.MANAGER, USER_ROLES.ADMIN]);
        if (originalAllowedRoles === undefined) {
            delete process.env.FINANCE_ALLOWED_ROLES;
        } else {
            process.env.FINANCE_ALLOWED_ROLES = originalAllowedRoles;
        }
    });

    it('bloqueia usuários fora da lista configurada de perfis permitidos', async () => {
        process.env.FINANCE_ALLOWED_ROLES = 'manager,admin';
        mockResolveEnvFallbackRoles.mockReturnValueOnce([USER_ROLES.MANAGER, USER_ROLES.ADMIN]);
        mockGetAllowedRoles.mockResolvedValueOnce([USER_ROLES.MANAGER, USER_ROLES.ADMIN]);
        const app = buildTestApp();
        const { agent } = await authenticateTestUser(app, { role: USER_ROLES.COLLABORATOR });

        const response = await agent
            .get('/finance')
            .set('Accept', 'application/json');

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ message: 'Acesso negado.' });
    });

    it('permite acesso a gestores quando configurados explicitamente', async () => {
        process.env.FINANCE_ALLOWED_ROLES = 'manager';
        mockResolveEnvFallbackRoles.mockReturnValueOnce([USER_ROLES.MANAGER]);
        mockGetAllowedRoles.mockResolvedValueOnce([USER_ROLES.MANAGER]);
        const app = buildTestApp();
        const { agent } = await authenticateTestUser(app, { role: USER_ROLES.MANAGER });

        const response = await agent
            .get('/finance')
            .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ redirect: '/finance/overview' });
    });

    it('bloqueia clientes quando é aplicado o fallback seguro', async () => {
        delete process.env.FINANCE_ALLOWED_ROLES;
        mockGetAllowedRoles.mockResolvedValueOnce([USER_ROLES.MANAGER, USER_ROLES.ADMIN]);
        mockResolveEnvFallbackRoles.mockReturnValueOnce([USER_ROLES.MANAGER, USER_ROLES.ADMIN]);
        const app = buildTestApp();
        const { agent } = await authenticateTestUser(app, { role: USER_ROLES.CLIENT });

        const response = await agent
            .get('/finance')
            .set('Accept', 'application/json');

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ message: 'Acesso negado.' });
    });

    it('permite acesso a gestores com fallback padrão seguro', async () => {
        delete process.env.FINANCE_ALLOWED_ROLES;
        mockGetAllowedRoles.mockResolvedValueOnce([USER_ROLES.MANAGER, USER_ROLES.ADMIN]);
        mockResolveEnvFallbackRoles.mockReturnValueOnce([USER_ROLES.MANAGER, USER_ROLES.ADMIN]);
        const app = buildTestApp();
        const { agent } = await authenticateTestUser(app, { role: USER_ROLES.MANAGER });

        const response = await agent
            .get('/finance')
            .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ redirect: '/finance/overview' });
    });
});
