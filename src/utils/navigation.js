const { USER_ROLES, getRoleLevel } = require('../constants/roles');

const rawShortcuts = [
    {
        label: 'Sobre',
        route: '/pages/sobre',
        icon: 'bi-info-circle',
        minimumRole: USER_ROLES.CLIENT,
        groups: ['menu']
    },
    {
        label: 'Contato',
        route: '/pages/contact',
        icon: 'bi-envelope',
        minimumRole: USER_ROLES.CLIENT,
        groups: ['menu']
    },
    {
        label: 'Suporte',
        route: '/support/tickets',
        icon: 'bi-life-preserver',
        minimumRole: USER_ROLES.CLIENT,
        groups: ['menu', 'quick']
    },
    {
        label: 'Painel',
        route: '/dashboard',
        icon: 'bi-graph-up-arrow',
        minimumRole: USER_ROLES.MANAGER,
        groups: ['menu', 'quick']
    },
    {
        label: 'Agendamentos',
        route: '/appointments',
        icon: 'bi-calendar-check',
        minimumRole: USER_ROLES.MANAGER,
        groups: ['menu', 'quick']
    },
    {
        label: 'Procedimentos',
        route: '/procedures',
        icon: 'bi-clipboard2-heart',
        minimumRole: USER_ROLES.MANAGER,
        groups: ['menu']
    },
    {
        label: 'Salas',
        route: '/rooms',
        icon: 'bi-door-open',
        minimumRole: USER_ROLES.MANAGER,
        groups: ['menu']
    },
    {
        label: 'Administração',
        route: '/admin',
        icon: 'bi-shield-check',
        minimumRole: USER_ROLES.ADMIN,
        groups: ['menu', 'quick']
    },
    {
        label: 'Empresas',
        route: '/admin/companies',
        icon: 'bi-buildings',
        minimumRole: USER_ROLES.ADMIN,
        groups: ['menu']
    },
    {
        label: 'Usuários',
        route: '/users/manage',
        icon: 'bi-people',
        minimumRole: USER_ROLES.ADMIN,
        groups: ['menu']
    },
    {
        label: 'Financeiro',
        route: '/finance',
        icon: 'bi-cash-coin',
        minimumRole: USER_ROLES.ADMIN,
        groups: ['menu', 'quick']
    },
    {
        label: 'Notificações',
        route: '/notifications',
        icon: 'bi-bell',
        minimumRole: USER_ROLES.ADMIN,
        groups: ['menu']
    }
];

const normalizeGroups = (groups) => {
    if (!Array.isArray(groups) || !groups.length) {
        return Object.freeze(['menu']);
    }

    const uniqueGroups = groups
        .map((group) => (typeof group === 'string' ? group.trim() : ''))
        .filter(Boolean);

    if (!uniqueGroups.length) {
        uniqueGroups.push('menu');
    }

    return Object.freeze(Array.from(new Set(uniqueGroups)));
};

const NAVIGATION_BLUEPRINT = Object.freeze(
    rawShortcuts
        .map((shortcut) => {
            const minimumRole = shortcut.minimumRole || USER_ROLES.CLIENT;
            const minimumLevel = getRoleLevel(minimumRole);

            if (minimumLevel < 0) {
                return null;
            }

            return Object.freeze({
                label: String(shortcut.label),
                route: String(shortcut.route),
                icon: String(shortcut.icon),
                minimumRole,
                minimumLevel,
                groups: normalizeGroups(shortcut.groups)
            });
        })
        .filter(Boolean)
);

const cloneShortcut = (shortcut) => ({
    label: shortcut.label,
    route: shortcut.route,
    icon: shortcut.icon,
    minimumRole: shortcut.minimumRole,
    minimumLevel: shortcut.minimumLevel,
    groups: shortcut.groups
});

const selectShortcutsByGroup = (shortcuts = [], group) => {
    if (!group) {
        return [];
    }

    return shortcuts
        .filter((shortcut) => Array.isArray(shortcut.groups) && shortcut.groups.includes(group))
        .map(cloneShortcut);
};

/**
 * Retorna a lista de atalhos de navegação disponíveis para o papel informado.
 * A função é pura, não altera estruturas existentes e sempre devolve novos objetos.
 *
 * @param {string} role - Papel do usuário autenticado.
 * @returns {
 *   level: number,
 *   shortcuts: Array<
 *     {
 *       label: string,
 *       route: string,
 *       icon: string,
 *       minimumRole: string,
 *       minimumLevel: number,
 *       groups: string[]
 *     }
 *   >
 * }
 */
const getNavigationShortcuts = (role) => {
    const level = getRoleLevel(role);

    if (level < 0) {
        return { level: -1, shortcuts: [] };
    }

    const shortcuts = NAVIGATION_BLUEPRINT.filter((shortcut) => level >= shortcut.minimumLevel).map(cloneShortcut);

    return { level, shortcuts };
};

const getMenuItems = (shortcuts = []) => selectShortcutsByGroup(shortcuts, 'menu');
const getQuickActions = (shortcuts = []) => selectShortcutsByGroup(shortcuts, 'quick');

module.exports = {
    NAVIGATION_BLUEPRINT,
    getNavigationShortcuts,
    getMenuItems,
    getQuickActions
};
