const { ROLE_LABELS } = require('../constants/roles');

const adminShortcuts = [
    {
        icon: 'bi-speedometer2',
        accent: 'primary',
        title: 'Dashboard executivo',
        description: 'Indicadores consolidados de performance, ocupação de agenda e metas financeiras.',
        href: '/dashboard'
    },
    {
        icon: 'bi-people',
        accent: 'success',
        title: 'Gestão de usuários',
        description: 'Controle de perfis, status e permissões com rastreabilidade completa.',
        href: '/users/manage'
    },
    {
        icon: 'bi-cash-coin',
        accent: 'warning',
        title: 'Centro financeiro',
        description: 'Fluxo de receitas e despesas, conciliações e previsões para decisões assertivas.',
        href: '/finance'
    },
    {
        icon: 'bi-megaphone',
        accent: 'info',
        title: 'Campanhas & notificações',
        description: 'Automatize comunicações e acompanhe métricas de engajamento em um único lugar.',
        href: '/notifications'
    },
    {
        icon: 'bi-calendar3-event',
        accent: 'danger',
        title: 'Operação e agenda',
        description: 'Sincronize recursos, salas e procedimentos com controle de capacidade.',
        href: '/appointments'
    },
    {
        icon: 'bi-shield-lock',
        accent: 'dark',
        title: 'Auditoria e conformidade',
        description: 'Relatórios detalhados das ações críticas para manter governança e segurança.',
        href: '/audit/logs'
    }
];

module.exports = {
    showPortal: (req, res) => {
        const roleLabel = ROLE_LABELS[req.user?.role] || 'Administrador';

        res.render('admin/portal', {
            pageTitle: 'Área administrativa',
            shortcuts: adminShortcuts,
            roleLabel
        });
    }
};
