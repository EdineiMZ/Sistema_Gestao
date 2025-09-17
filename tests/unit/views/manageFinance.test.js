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

