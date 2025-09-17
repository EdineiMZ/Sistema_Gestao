require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
const { sequelize, User } = require('./database/models');
const { USER_ROLES, ROLE_LABELS, ROLE_ORDER, getRoleLevel } = require('./src/constants/roles');
const { getNavigationShortcuts, getMenuItems, getQuickActions } = require('./src/utils/navigation');

const APP_NAME = process.env.APP_NAME || 'Sistema de Gestão Inteligente';

// Importa o serviço de notificações
const { startWorker } = require('./src/services/notificationWorker');
const notificationIndicator = require('./src/middlewares/notificationIndicator');

const parseInlineWorkerPreference = () => {
    const rawValue = (process.env.NOTIFICATION_WORKER_INLINE || '').trim().toLowerCase();

    if (!rawValue) {
        return true;
    }

    if (['false', '0', 'no', 'off', 'disable', 'disabled'].includes(rawValue)) {
        return false;
    }

    return true;
};

const shouldStartNotificationWorker = parseInlineWorkerPreference();

// Rotas
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const pagesRoutes = require('./src/routes/pagesRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const procedureRoutes = require('./src/routes/procedureRoutes');
const roomRoutes = require('./src/routes/roomRoutes');
const appointmentRoutes = require('./src/routes/appointmentRoutes');
const financeRoutes = require('./src/routes/financeRoutes');
const adminFinanceRoutes = require('./src/routes/adminFinanceRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const auditRoutes = require('./src/routes/auditRoutes');
const campaignRoutes = require('./src/routes/campaignRoutes');
const adminRoutes = require('./src/routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'segredo';

// Segurança
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    'https://cdn.jsdelivr.net'
                ],
                styleSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    'https://fonts.googleapis.com',
                    'https://cdn.jsdelivr.net'
                ],
                fontSrc: [
                    "'self'",
                    'https://fonts.gstatic.com',
                    'https://cdn.jsdelivr.net',
                    'data:'
                ],
                imgSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net'],
                connectSrc: ["'self'"],
                frameAncestors: ["'self'"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"]
            }
        }
    })
);
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15min
    max: 100,
    message: 'Muitas requisições deste IP, tente novamente mais tarde.'
});
app.use(limiter);

// Middlewares básicos
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

// Sessão
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
}));
app.use(flash());

// Variáveis locais
const roleOptions = ROLE_ORDER.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

app.use((req, res, next) => {
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
            .filter((message) => Boolean(message));

        if (!values.length) {
            return null;
        }

        return values.join(' ');
    };

    const successFlash = normalizeFlashMessages(req.flash('success_msg'));
    const errorFlash = normalizeFlashMessages(req.flash('error_msg'));
    const genericErrorFlash = normalizeFlashMessages(req.flash('error'));

    res.locals.success_msg = successFlash;
    res.locals.error_msg = errorFlash || genericErrorFlash;
    res.locals.error = genericErrorFlash;
    res.locals.user = null;
    res.locals.userRoleLevel = -1;
    res.locals.appName = APP_NAME;
    res.locals.pageTitle = APP_NAME;
    res.locals.roles = USER_ROLES;
    res.locals.roleLabels = ROLE_LABELS;
    res.locals.roleOptions = roleOptions;
    res.locals.getRoleLevel = getRoleLevel;
    res.locals.managerLevel = getRoleLevel(USER_ROLES.MANAGER);
    res.locals.adminLevel = getRoleLevel(USER_ROLES.ADMIN);
    res.locals.notifications = [];
    res.locals.notificationError = null;
    res.locals.userMenuItems = [];
    res.locals.quickActions = [];
    next();
});

// Recuperar User logado
app.use(async (req, res, next) => {
    req.user = null;

    if (!req.session.user) {
        return next();
    }

    try {
        const dbUser = await User.findByPk(req.session.user.id);
        if (dbUser && dbUser.active) {
            const sanitizedUser = {
                id: dbUser.id,
                name: dbUser.name,
                role: dbUser.role,
                active: dbUser.active,
                profileImage: dbUser.profileImage
            };

            req.user = sanitizedUser;
            res.locals.user = sanitizedUser;
            req.session.user = {
                id: dbUser.id,
                name: dbUser.name,
                email: dbUser.email,
                role: dbUser.role,
                active: dbUser.active
            };
        } else {
            req.session.user = null;
            res.locals.user = null;
        }
    } catch (error) {
        console.error('Erro ao buscar user no middleware:', error);
        res.locals.user = null;
    }

    const roleForNavigation = res.locals.user && res.locals.user.role ? res.locals.user.role : null;
    const navigationContext = getNavigationShortcuts(roleForNavigation);
    res.locals.userRoleLevel = navigationContext.level;
    res.locals.userMenuItems = getMenuItems(navigationContext.shortcuts);
    res.locals.quickActions = getQuickActions(navigationContext.shortcuts);

    return next();
});

// Indicador de notificações no cabeçalho
app.use(notificationIndicator);

// EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

// Arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Rotas
app.use('/', authRoutes);
app.use('/users', userRoutes);
app.use('/pages', pagesRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/procedures', procedureRoutes);
app.use('/rooms', roomRoutes);
app.use('/appointments', appointmentRoutes);
app.use('/finance', financeRoutes);
app.use('/admin/finance', adminFinanceRoutes);
app.use('/notifications', notificationRoutes);
app.use('/campaigns', campaignRoutes);
app.use('/audit', auditRoutes);
app.use('/admin', adminRoutes);

// Conexão DB
sequelize
    .sync()
    .then(() => {
        console.log('Banco de dados sincronizado com sucesso!');
        // Sobe o servidor
        app.listen(PORT, () => {
            console.log(`Servidor rodando em http://127.0.0.1:${PORT}`);
        });

        if (shouldStartNotificationWorker) {
            try {
                startWorker({ immediate: true });
                console.log('Worker de notificações executando inline com intervalo de 1 minuto.');
            } catch (workerError) {
                console.error('Não foi possível iniciar o worker de notificações inline:', workerError);
            }
        } else {
            console.log('Worker de notificações inline desativado via NOTIFICATION_WORKER_INLINE.');
        }
    })
    .catch(err => {
        console.error('Erro ao sincronizar DB:', err);
    });
