const path = require('path');
const ejs = require('ejs');

const { USER_ROLES, ROLE_LABELS, getRoleLevel } = require('../../../src/constants/roles');

const viewPath = path.join(__dirname, '../../../src/views/finance/manageFinance.ejs');

const buildViewContext = () => ({
    pageTitle: 'Gestão financeira',
    appName: 'Sistema de Gestão Inteligente',
    user: {
        id: 7,
        name: 'Admin QA',
        role: USER_ROLES.ADMIN,
        profileImage: null
    },
    userRoleLevel: getRoleLevel(USER_ROLES.ADMIN),
    roleLabels: ROLE_LABELS,
    entries: [
        {
            id: 101,
            description: 'Mensalidade Plano Premium',
            type: 'receivable',
            value: '1200.50',
            dueDate: '2024-05-01',
            paymentDate: '2024-05-02',
            status: 'paid',
            recurring: true,
            recurringInterval: 'Mensal'
        },
        {
            id: 102,
            description: 'Serviço de consultoria',
            type: 'payable',
            value: '450.00',
            dueDate: '2024-05-10',
            paymentDate: null,
            status: 'pending',
            recurring: false,
            recurringInterval: null
        }
    ],
    filters: {
        startDate: '2024-05-01',
        endDate: '2024-05-31',
        type: 'receivable',
        status: 'paid'
    },
    periodLabel: '01/05/2024 a 31/05/2024',
    financeTotals: {
        receivable: 3200.75,
        payable: 1850.25,
        net: 1350.5,
        overdue: 420.0,
        paid: 2800.5,
        pending: 250.25
    },
    statusSummary: {
        receivable: {
            pending: 250.25,
            paid: 2800.5,
            overdue: 150,
            cancelled: 0
        },
        payable: {
            pending: 0,
            paid: 1400,
            overdue: 270,
            cancelled: 180.25
        }
    },
    monthlySummary: [
        { month: '2024-04', receivable: 1800.25, payable: 950.5 },
        { month: '2024-05', receivable: 1400.5, payable: 899.75 }
    ],
    success_msg: null,
    error_msg: null,
    error: null,
    notifications: []
});

describe('views/finance/manageFinance', () => {
    it('renders export buttons pointing to PDF and Excel routes', async () => {
        const html = await ejs.renderFile(viewPath, buildViewContext(), { async: true });

        expect(html).toContain('href="/finance/export/pdf"');
        expect(html).toContain('data-export-target="/finance/export/pdf"');
        expect(html).toContain('Exportar PDF');
        expect(html).toContain('aria-label="Exportar lançamentos filtrados em PDF"');

        expect(html).toContain('href="/finance/export/excel"');
        expect(html).toContain('data-export-target="/finance/export/excel"');
        expect(html).toContain('Exportar Excel');
        expect(html).toContain('aria-label="Exportar lançamentos filtrados em Excel"');
    });

    it('renders filter form with active parameters and auto-submit controls', async () => {
        const html = await ejs.renderFile(viewPath, buildViewContext(), { async: true });

        expect(html).toContain('data-filter-form');
        expect(html).toContain('name="startDate"');
        expect(html).toContain('value="2024-05-01"');
        expect(html).toContain('name="endDate"');
        expect(html).toContain('value="2024-05-31"');
        expect(html).toContain('<option value="receivable" selected>');
        expect(html).toContain('<option value="paid" selected>');
        expect(html).toContain('data-auto-submit="true"');
    });

    it('shows finance summaries, chart area and status distribution', async () => {
        const html = await ejs.renderFile(viewPath, buildViewContext(), { async: true });
        const normalizedHtml = html.replace(/\u00a0/g, ' ');

        expect(normalizedHtml).toContain('Visão consolidada');
        expect(normalizedHtml).toContain('Performance mensal');
        expect(normalizedHtml).toContain('Status por categoria');
        expect(normalizedHtml).toContain('R$ 3.200,75');
        expect(normalizedHtml).toContain('R$ 1.850,25');
        expect(normalizedHtml).toContain('abril de 2024');
        expect(normalizedHtml).toContain('maio de 2024');
        expect(normalizedHtml).toContain('financePerformanceChart');
        expect(normalizedHtml).toContain('chart.umd.min.js');
    });
});

