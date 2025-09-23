const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');

const {
    USER_ROLES,
    ROLE_LABELS,
    ROLE_ORDER,
    getRoleLevel
} = require('../../src/constants/roles');
const {
    COMPANY_ACCESS_LEVELS,
    COMPANY_ACCESS_LEVEL_LABELS,
    buildCompanyAccessLevelOptions,
    DEFAULT_COMPANY_ACCESS_LEVEL
} = require('../../src/constants/companyAccessLevels');

const DEFAULT_APP_NAME = 'Sistema de Gestão Inteligente';

const sanitizeUser = (user = {}) => ({
    id: user.id ?? 999,
    name: user.name || 'Usuário Teste',
    email: user.email || 'usuario@example.com',
    role: user.role || USER_ROLES.ADMIN,
    active: user.active !== false,
    profileImage: user.profileImage || null
});

const normalizeFlashMessages = (messages) => {
    if (!messages) {
        return null;
    }

    const values = (Array.isArray(messages) ? messages : [messages])
        .map((message) => {
            if (typeof message === 'string') {
                return message.trim();
            }

            if (message && typeof message.message === 'string') {
                return message.message.trim();
            }

            if (message && typeof message.toString === 'function') {
                return message.toString().trim();
            }

            return '';
        })
        .filter(Boolean);

    if (!values.length) {
        return null;
    }

    return values.join(' ');
};

const createRouterTestApp = ({ routes = [] } = {}) => {
    const app = express();

    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());

    app.use(session({
        secret: 'router-test-session',
        resave: false,
        saveUninitialized: false
    }));
    app.use(flash());

    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', '..', 'src', 'views'));

    const roleOptions = ROLE_ORDER.map((role) => ({ value: role, label: ROLE_LABELS[role] }));
    const companyAccessLevelOptions = buildCompanyAccessLevelOptions();

    app.use((req, res, next) => {
        res.locals.appName = DEFAULT_APP_NAME;
        res.locals.pageTitle = DEFAULT_APP_NAME;
        res.locals.roles = USER_ROLES;
        res.locals.roleLabels = ROLE_LABELS;
        res.locals.roleOptions = roleOptions;
        res.locals.companyAccessLevels = COMPANY_ACCESS_LEVELS;
        res.locals.companyAccessLevelLabels = COMPANY_ACCESS_LEVEL_LABELS;
        res.locals.companyAccessLevelOptions = companyAccessLevelOptions;
        res.locals.defaultCompanyAccessLevel = DEFAULT_COMPANY_ACCESS_LEVEL;
        res.locals.success_msg = normalizeFlashMessages(req.flash('success_msg'));
        res.locals.error_msg = normalizeFlashMessages(req.flash('error_msg'));
        res.locals.error = normalizeFlashMessages(req.flash('error'));
        res.locals.notifications = Array.isArray(req.session.notifications) ? req.session.notifications : [];
        res.locals.notificationError = null;
        res.locals.managerLevel = getRoleLevel(USER_ROLES.MANAGER);
        res.locals.adminLevel = getRoleLevel(USER_ROLES.ADMIN);

        const sessionUser = req.session.user;
        if (sessionUser && sessionUser.active) {
            req.user = sessionUser;
            res.locals.user = sessionUser;
            res.locals.userRoleLevel = getRoleLevel(sessionUser.role);
        } else {
            req.user = null;
            res.locals.user = null;
            res.locals.userRoleLevel = -1;
        }

        return next();
    });

    app.post('/__test/login', (req, res) => {
        const sanitizedUser = sanitizeUser(req.body.user);
        req.session.user = sanitizedUser;
        req.session.notifications = Array.isArray(req.body.notifications) ? req.body.notifications : [];
        res.status(204).end();
    });

    app.post('/__test/logout', (req, res) => {
        req.session.regenerate((error) => {
            if (error) {
                return res.status(500).json({ message: 'Não foi possível encerrar a sessão de teste.' });
            }
            return res.status(204).end();
        });
    });

    routes.forEach(([basePath, router]) => {
        app.use(basePath, router);
    });

    return app;
};

module.exports = { createRouterTestApp };
