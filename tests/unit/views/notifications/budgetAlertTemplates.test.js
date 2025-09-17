const path = require('path');
const ejs = require('ejs');

describe('views/notifications budget alert templates', () => {
    const templatesDir = path.join(__dirname, '../../../../src/views/notifications');
    const now = new Date('2024-05-10T12:00:00Z');

    const budgetSample = {
        budgetId: 21,
        categoryName: 'Marketing Digital',
        monthlyLimit: 15000,
        consumption: 13850.75,
        month: '2024-05',
        thresholds: [10000, 13000],
        categoryColor: '#f97316'
    };

    const baseOptions = {
        user: { id: 77, name: 'Ana Paula Souza' },
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
        emailUtils = require('../../../../src/utils/email');
    });

    afterAll(() => {
        delete process.env.BUDGET_LINK_SECRET;
        jest.resetModules();
    });

    it('gera snapshot consistente do template de e-mail', async () => {
        const context = emailUtils.buildBudgetAlertContext(budgetSample, baseOptions);
        const html = await ejs.renderFile(
            path.join(templatesDir, 'budgetAlertEmail.ejs'),
            context,
            { async: true }
        );

        expect(html.replace(/\s+/g, ' ').trim()).toMatchSnapshot();
    });

    it('gera snapshot consistente do template in-app', async () => {
        const context = emailUtils.buildBudgetAlertContext(budgetSample, baseOptions);
        const html = await ejs.renderFile(
            path.join(templatesDir, 'budgetAlertInApp.ejs'),
            context,
            { async: true }
        );

        expect(html.replace(/\s+/g, ' ').trim()).toMatchSnapshot();
    });
});
