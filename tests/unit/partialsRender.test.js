const path = require('path');
const ejs = require('ejs');

const {
    USER_ROLES,
    ROLE_LABELS,
    ROLE_ORDER,
    getRoleLevel
} = require('../../src/constants/roles');

const partialsDir = path.join(__dirname, '..', '..', 'src', 'views', 'partials');

const roleOptions = ROLE_ORDER.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

const baseContext = {
    appName: 'Sistema de Gestão Inteligente',
    pageTitle: 'Teste',
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

describe('Renderização de parciais críticas', () => {
    it('renderiza o header para visitantes sem erros', async () => {
        const html = await ejs.renderFile(
            path.join(partialsDir, 'header.ejs'),
            {
                ...baseContext,
                user: null,
                userRoleLevel: -1,
                notifications: []
            },
            { async: true }
        );

        expect(html).toContain('<nav');
        expect(html).toContain('Entrar');
    });

    it('renderiza o header para administradores com notificações', async () => {
        const html = await ejs.renderFile(
            path.join(partialsDir, 'header.ejs'),
            {
                ...baseContext,
                user: {
                    id: 42,
                    name: 'Admin QA',
                    role: USER_ROLES.ADMIN,
                    active: true
                },
                userRoleLevel: getRoleLevel(USER_ROLES.ADMIN),
                notifications: [
                    { id: 1, title: 'Alerta', preview: 'Nova notificação disponível' }
                ]
            },
            { async: true }
        );

        expect(html).toContain('Administração');
        expect(html).toContain('data-testid="notification-badge"');
    });

    it('renderiza o footer exibindo o nome do app', async () => {
        const html = await ejs.renderFile(
            path.join(partialsDir, 'footer.ejs'),
            baseContext,
            { async: true }
        );

        expect(html).toContain('&copy;');
        expect(html).toContain(baseContext.appName);
    });
});
