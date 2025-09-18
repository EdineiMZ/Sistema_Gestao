const path = require('path');
const ejs = require('ejs');

const {
    USER_ROLES,
    ROLE_LABELS,
    ROLE_ORDER,
    getRoleLevel
} = require('../../src/constants/roles');

describe('Finance management view', () => {
    const templatePath = path.join(__dirname, '..', '..', 'src', 'views', 'finance', 'manageFinance.ejs');
    const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const roleOptions = ROLE_ORDER.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

    const renderView = (context) => new Promise((resolve, reject) => {
        ejs.renderFile(templatePath, context, {}, (err, html) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(html);
        });
    });

    const sharedContext = {
        appName: 'Sistema de Gestão',
        pageTitle: 'Financeiro',
        success_msg: null,
        error_msg: null,
        error: null,
        roleLabels: ROLE_LABELS,
        roleOptions,
        roles: USER_ROLES,
        managerLevel: getRoleLevel(USER_ROLES.MANAGER),
        adminLevel: getRoleLevel(USER_ROLES.ADMIN),
        notifications: []
    };

    const baseContext = {
        ...sharedContext,
        csrfToken: 'test-csrf-token',
        user: { id: 1, name: 'Usuário Teste', role: USER_ROLES.MANAGER },
        userRoleLevel: getRoleLevel(USER_ROLES.MANAGER),
        entries: [
            {
                id: 1,
                description: 'Venda recorrente',
                type: 'receivable',
                value: 1200.5,
                dueDate: '2024-05-20',
                paymentDate: null,
                status: 'pending',
                recurring: false,
                recurringInterval: '',
                category: null,
                attachments: []
            }
        ],
        financeTotals: {
            receivable: 3200.75,
            payable: 1850.25,
            pending: 980.35,
            overdue: 450.2
        },
        monthlySummary: [
            { month: '2024-05', receivable: 1600.25, payable: 930.1 }
        ],
        statusSummary: {
            receivable: { pending: 1200.4, paid: 1600.35, overdue: 400.0, cancelled: 0 },
            payable: { pending: 900.2, paid: 750.05, overdue: 200.0, cancelled: 0 }
        },
        projectionList: [],
        financeGoals: [],
        financeThresholds: {
            overdueDays: 12,
            spendingAlertPercent: 78,
            netGoalFloor: 3500
        },
        budgetSummaries: [
            {
                id: 1,
                month: '2024-05',
                categoryName: 'Operacional',
                categoryColor: '#2563eb',
                percentage: 45,
                consumption: 450,
                monthlyLimit: 1000,
                remaining: 550,
                status: 'healthy',
                statusMeta: { key: 'healthy' }
            }
        ],
        categoryConsumption: [
            {
                categoryName: 'Operacional',
                averagePercentage: 45,
                highestPercentage: 70,
                totalConsumption: 450,
                months: 1,
                categoryColor: '#2563eb'
            }
        ],
        budgetMonths: ['2024-05'],
        filters: {},
        alertsList: [],
        importPreview: null,
        formatCurrency: (value) => currencyFormatter.format(Number(value) || 0)
    };

    it('renders quick metrics and navigation links for budgets', async () => {
        const html = await renderView(baseContext);

        expect(html).toContain('Visão rápida de resultados');
        expect(html).toContain('data-quick-metrics');
        expect(html).toContain('href="/finance/budgets"');
    });

    it('injects csrf token into editable threshold form', async () => {
        const html = await renderView(baseContext);

        expect(html).toContain('data-thresholds-form');
        expect(html).toMatch(/name="_csrf"\s+value="test-csrf-token"/);
        expect(html).toContain('id="threshold-overdue-days"');
        expect(html).toContain('value="12"');
    });

    it('allows overriding navigation URL for budgets', async () => {
        const customHtml = await renderView({
            ...baseContext,
            budgetPageUrl: '/finance/planejamento'
        });

        expect(customHtml).toContain('href="/finance/planejamento"');
    });
});
