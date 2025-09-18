const { USER_ROLES, getRoleLevel } = require('../../../src/constants/roles');
const {
    NAVIGATION_BLUEPRINT,
    getNavigationShortcuts,
    getMenuItems,
    getQuickActions
} = require('../../../src/utils/navigation');

describe('utils/navigation', () => {
    it('returns empty shortcuts for unknown role', () => {
        const { level, shortcuts } = getNavigationShortcuts('unknown-role');
        expect(level).toBe(-1);
        expect(shortcuts).toEqual([]);
        expect(getMenuItems()).toEqual([]);
        expect(getQuickActions()).toEqual([]);
    });

    it('resolves manager shortcuts without admin-only routes', () => {
        const { level, shortcuts } = getNavigationShortcuts(USER_ROLES.MANAGER);
        expect(level).toBe(getRoleLevel(USER_ROLES.MANAGER));
        const routes = shortcuts.map((item) => item.route);
        expect(routes).toEqual(expect.arrayContaining(['/dashboard', '/appointments', '/procedures', '/rooms']));
        ['/admin', '/users/manage', '/finance'].forEach((restrictedRoute) => {
            expect(routes).not.toContain(restrictedRoute);
        });
    });

    it('quick actions are a subset of available shortcuts', () => {
        const { shortcuts } = getNavigationShortcuts(USER_ROLES.ADMIN);
        const quickActions = getQuickActions(shortcuts);
        const shortcutRoutes = shortcuts.map((item) => item.route);
        quickActions.forEach((action) => {
            expect(shortcutRoutes).toContain(action.route);
        });
        expect(quickActions.length).toBeGreaterThan(0);
    });

    it('does not mutate blueprint or cached results', () => {
        const { shortcuts } = getNavigationShortcuts(USER_ROLES.ADMIN);
        const firstRoute = shortcuts[0].route;
        shortcuts[0].label = 'Rótulo alterado';

        const { shortcuts: secondCall } = getNavigationShortcuts(USER_ROLES.ADMIN);
        const blueprintItem = NAVIGATION_BLUEPRINT.find((item) => item.route === firstRoute);
        const recalculated = secondCall.find((item) => item.route === firstRoute);

        expect(blueprintItem.label).not.toBe('Rótulo alterado');
        expect(recalculated.label).not.toBe('Rótulo alterado');
    });
});
