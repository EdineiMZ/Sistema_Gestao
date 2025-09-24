const path = require('path');
const ejs = require('ejs');

const { USER_ROLES, ROLE_LABELS, getRoleLevel } = require('../../../src/constants/roles');
const { FINANCE_RECURRING_INTERVALS } = require('../../../src/constants/financeRecurringIntervals');

const viewPath = path.join(__dirname, '../../../src/views/finance/payments.ejs');

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
    csrfToken: 'unit-csrf-token',
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
            financeCategoryId: 11,
            category: { id: 11, name: 'Consultorias', color: '#2563eb' },
            attachments: [
                {
                    id: 701,
                    fileName: 'comprovante.pdf',
                    size: 20480
                }
            ]
        },
        {
            id: 202,
            description: 'Assinatura de software SaaS',
            type: 'payable',
            value: '289.90',
            dueDate: '2024-05-15',
            paymentDate: null,
            status: 'pending',
            recurring: true,
            recurringInterval: 'monthly',
            financeCategoryId: 12,
            category: { id: 12, name: 'Marketing', color: '#9333ea' },
            attachments: []
        }
    ],
    financeTotals: {
        receivable: 3200.75,
        payable: 1850.25,
        net: 1350.5,
        overdue: 450.2,
        paid: 2200.55,
        pending: 980.35
    },
    summaryStatus: {
        receivable: { pending: 1200.4, paid: 1600.35, overdue: 400, cancelled: 0 },
        payable: { pending: 900.2, paid: 750.05, overdue: 200, cancelled: 0 }
    },
    monthlySummary: [
        { month: '2024-04', receivable: 1600.5, payable: 920.15 },
        { month: '2024-05', receivable: 1600.25, payable: 930.1 }
    ],
    filters: {
        startDate: '2024-05-01',
        endDate: '2024-05-31',
        type: 'receivable',
        status: 'paid'
    },
    categories: [
        { id: 11, name: 'Consultorias', color: '#2563eb' },
        { id: 12, name: 'Marketing', color: '#9333ea' }
    ],
    recurringIntervalOptions: FINANCE_RECURRING_INTERVALS,
    importPreview: {
        entries: [
            {
                description: 'Pagamento fornecedor',
                type: 'payable',
                value: '800.00',
                dueDate: '2024-06-10',
                paymentDate: null,
                status: 'pending',
                conflicts: []
            }
        ],
        totals: { new: 1, conflicting: 0, total: 1 },
        uploadedAt: new Date().toISOString()
    },
    pagination: {
        page: 1,
        pageSize: 10,
        totalPages: 2,
        totalRecords: 12
    },
    success_msg: null,
    error_msg: null,
    error: null,
    notifications: []
});

describe('views/finance/payments', () => {
    it('renders export buttons pointing to PDF and Excel routes', async () => {
        const html = await ejs.renderFile(viewPath, buildViewContext(), { async: true });

        expect(html).toContain('href="/finance/export/pdf"');
        expect(html).toContain('data-export-target="/finance/export/pdf"');
        expect(html).toContain('Exportar PDF');

        expect(html).toContain('href="/finance/export/excel"');
        expect(html).toContain('data-export-target="/finance/export/excel"');
        expect(html).toContain('Exportar Excel');

        expect(html).toContain('role="group"');
        expect(html).toContain('aria-label="Exportar lançamentos financeiros"');

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

        expect(normalizedHtml).toContain('Performance mensal');
        expect(normalizedHtml).toContain('Status por categoria');
        expect(normalizedHtml).toContain('R$ 3.200,75');
        expect(normalizedHtml).toContain('R$ 1.850,25');
        expect(normalizedHtml).toContain('financePerformanceChart');
        expect(normalizedHtml).toContain('chart.umd.min.js');
    });

    it('exibe controles de upload e anexos vinculados aos lançamentos', async () => {
        const context = buildViewContext();
        const html = await ejs.renderFile(viewPath, context, { async: true });

        expect(html).toContain('enctype="multipart/form-data"');
        expect(html).toContain('name="attachments"');
        expect(html).toContain('data-entry-edit');
        expect(html).toContain('data-entry-attachments=');
        expect(html).toContain('financeEntryModal');
        expect(html).toContain('data-modal-attachments');
        expect(html).toContain('comprovante.pdf');
    });

    it('renders import preview with selection controls', async () => {
        const html = await ejs.renderFile(viewPath, buildViewContext(), { async: true });

        expect(html).toContain('Prévia de importação');
        expect(html).toContain('data-import-select-all');
        expect(html).toContain('name="entries[0][enabled]"');
        expect(html).toContain('Importar lançamentos selecionados');
    });

    it('exibe navegação paginada com resumo de registros', async () => {
        const html = await ejs.renderFile(viewPath, buildViewContext(), { async: true });

        expect(html).toContain('aria-label="Paginação de lançamentos"');
        expect(html).toContain('pageSize=10');
        expect(html).toContain('page=2');
        expect(html).toContain('Exibindo <strong>');
        expect(html).toContain('de <strong>12</strong>');
    });

    it('exibe ação de quitação com proteção CSRF para lançamentos pendentes', async () => {
        const html = await ejs.renderFile(viewPath, buildViewContext(), { async: true });

        expect(html).toContain('data-finance-pay-form');
        expect(html).toContain('action="/finance/pay/202"');
        expect(html).toContain('data-finance-pay-submit');
        expect(html).not.toContain('action="/finance/pay/101"');
        expect(html).toContain('name="_csrf" value="unit-csrf-token"');
    });
});
