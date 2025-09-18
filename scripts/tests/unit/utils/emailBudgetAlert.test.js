const path = require('path');

const MODULE_PATH = path.join(__dirname, '../../../src/utils/email');

describe('utils/email budget alert helpers', () => {
    const now = new Date('2024-05-10T12:00:00Z');
    const budgetSample = {
        budgetId: 17,
        categoryName: 'Marketing Digital',
        monthlyLimit: 15000,
        consumption: 13850.75,
        month: '2024-05',
        thresholds: [10000, 13000],
        categoryColor: '#f97316'
    };

    const baseOptions = {
        user: { id: 42, name: 'Ana Paula Souza' },
        baseUrl: 'https://app.exemplo.com',
        routePath: '/finance/orcamentos',
        organizationName: 'Sistema de Gestão Inteligente',
        appName: 'Sistema de Gestão Inteligente',
        now
    };

    let emailUtils;

    beforeAll(() => {
        process.env.BUDGET_LINK_SECRET = 'unit-test-secret';
        jest.resetModules();
        // eslint-disable-next-line global-require
        emailUtils = require(MODULE_PATH);
    });

    afterAll(() => {
        delete process.env.BUDGET_LINK_SECRET;
        jest.resetModules();
    });

    it('gera link seguro para o orçamento com token assinado', () => {
        const result = emailUtils.buildBudgetAccessLink({
            budgetId: budgetSample.budgetId,
            userId: baseOptions.user.id,
            baseUrl: baseOptions.baseUrl,
            routePath: baseOptions.routePath,
            now
        });

        expect(result.url).toMatch(/^https:\/\/app\.exemplo\.com/);
        expect(result.relativePath).toContain('/finance/orcamentos');
        expect(result.relativePath).toContain('budgetToken=');
        expect(result.token).toEqual(expect.any(String));
        expect(result.token.length).toBeGreaterThan(20);
        expect(result.expiresAt.getTime()).toBeGreaterThan(result.issuedAt.getTime());
    });

    it('normaliza dados do orçamento para o template', () => {
        const context = emailUtils.buildBudgetAlertContext(budgetSample, baseOptions);

        expect(context.budget.categoryName).toBe('Marketing Digital');
        expect(context.budget.monthLabel).toMatch(/maio/);
        expect(context.budget.usagePercent).toBeGreaterThan(90);
        expect(context.links.accessUrl).toContain('budgetToken=');
        expect(context.tokens.access.expiresAtLabel).toMatch(/\d{2}\/\d{2}\/\d{4}/);
        expect(context.insights.length).toBeGreaterThan(0);
    });

    it('monta assunto com status e nome da organização', () => {
        const context = emailUtils.buildBudgetAlertContext(budgetSample, baseOptions);
        const subject = emailUtils.buildBudgetAlertSubject(context);

        expect(subject).toContain('Alerta de orçamento');
        expect(subject).toContain('Marketing Digital');
        expect(subject).toContain('Sistema de Gestão Inteligente');
    });

    it('renderiza payload de email completo', async () => {
        const payload = await emailUtils.buildBudgetAlertEmailPayload(budgetSample, baseOptions);

        expect(payload.subject).toBe(emailUtils.buildBudgetAlertSubject(payload.context));
        expect(payload.html).toContain('<html');
        expect(payload.html).toContain('Marketing Digital');
        expect(payload.html).toContain('Acessar orçamento');
        expect(payload.text).toContain('Marketing Digital');
    });
});
