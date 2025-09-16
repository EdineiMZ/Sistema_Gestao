const path = require('path');
const ejs = require('ejs');
const { USER_ROLES, ROLE_LABELS } = require('../../../src/constants/roles');
const {
    getNavigationShortcuts,
    getMenuItems,
    getQuickActions
} = require('../../../src/utils/navigation');

describe('views/partials/header', () => {
    it('renders only the shortcuts allowed for the user role', async () => {
        const { shortcuts } = getNavigationShortcuts(USER_ROLES.MANAGER);
        const userMenuItems = getMenuItems(shortcuts);
        const quickActions = getQuickActions(shortcuts);

        const html = await ejs.renderFile(
            path.join(__dirname, '../../../src/views/partials/header.ejs'),
            {
                pageTitle: 'Área interna',
                appName: 'Sistema Teste',
                user: { name: 'Maria Gestora', role: USER_ROLES.MANAGER, profileImage: null },
                roleLabels: ROLE_LABELS,
                notifications: [],
                userMenuItems,
                quickActions,
                success_msg: null,
                error_msg: null,
                error: null
            }
        );

        const expectedRoutes = [
            '/dashboard',
            '/appointments',
            '/procedures',
            '/rooms',
            '/pages/sobre',
            '/pages/contact'
        ];
        expectedRoutes.forEach((route) => {
            expect(html).toContain(`href="${route}"`);
        });

        const forbiddenRoutes = ['/admin', '/users/manage', '/finance'];
        forbiddenRoutes.forEach((route) => {
            expect(html).not.toContain(`href="${route}"`);
        });

        expect(html).toContain('user-menu-quick-link');
        expect(html).toContain('user-menu-link');
        expect(html).toContain('user-menu-logout');
        const navCloseMatches = html.match(/data-nav-close/g) || [];
        expect(navCloseMatches.length).toBeGreaterThan(0);
    });
});
