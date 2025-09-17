const path = require('path');
const ejs = require('ejs');

const { USER_ROLES, ROLE_LABELS, getRoleLevel } = require('../../../src/constants/roles');
const { FINANCE_RECURRING_INTERVALS } = require('../../../src/constants/financeRecurringIntervals');

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
            recurringInterval: 'Mensal',
            attachments: [
                {
                    id: 701,
                    fileName: 'comprovante.pdf',
                    size: 20480
                }
            ]
        }
    ],
    recurringIntervalOptions: FINANCE_RECURRING_INTERVALS,
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

        expect(html).toContain('option value="monthly"');
        expect(html).toContain('>Mensal<');
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

    it('exibe controles de upload e anexos vinculados aos lançamentos', async () => {
        const context = buildViewContext();
        const html = await ejs.renderFile(viewPath, context, { async: true });

        expect(html).toContain('enctype="multipart/form-data"');
        expect(html).toContain('name="attachments"');
        expect(html).toContain('href="/finance/attachments/701/download"');
        expect(html).toContain('comprovante.pdf');
        expect(html).toContain('bi bi-paperclip');
    });
});

