require('dotenv').config();
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
const { sequelize, User } = require('./database/models');
const { Umzug, SequelizeStorage } = require('umzug');
const { initializeSupportChat } = require('./src/services/supportChatService');
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
const supportRoutes = require('./src/routes/supportRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: false,
    connectionStateRecovery: {
        maxDisconnectionDuration: 60_000
    }
});
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
    throw new Error('A variável de ambiente SESSION_SECRET é obrigatória para iniciar o servidor.');
}

const sessionStore = new SequelizeStore({
    db: sequelize,
    tableName: 'sessions',
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 7 * 24 * 60 * 60 * 1000
});

const createMigrator = () => {
    const migrationsPath = path.join(__dirname, 'database', 'migrations', '*.js');
    const queryInterface = sequelize.getQueryInterface();

    return new Umzug({
        context: queryInterface,
        storage: new SequelizeStorage({ sequelize }),
        migrations: {
            glob: migrationsPath,
            resolve: ({ name, path: migrationPath }) => {
                const migration = require(migrationPath);

                return {
                    name,
                    up: async () => {
                        if (typeof migration.up === 'function') {
                            await migration.up(queryInterface, sequelize.Sequelize);
                        }
                    },
                    down: async () => {
                        if (typeof migration.down === 'function') {
                            await migration.down(queryInterface, sequelize.Sequelize);
                        }
                    }
                };
            }
        },
        logger: console
    });
};

const extractRootError = (error) => {
    if (!error) {
        return null;
    }

    return error.cause || error.original || error.parent || error;
};

const isIgnorableMigrationError = (error) => {
    const rootError = extractRootError(error);
    const code = rootError?.code || rootError?.original?.code;
    const errno = rootError?.errno || rootError?.original?.errno;
    const message = [
        error?.message,
        rootError?.message
    ].filter(Boolean).join(' ') || '';

    return code === 'ER_DUP_FIELDNAME' ||
        code === 'ER_DUP_KEYNAME' ||
        code === 'ER_DUP_ENTRY' ||
        code === 'SQLITE_CONSTRAINT' ||
        errno === 1060 ||
        errno === 1061 ||
        errno === 1 && /duplicate column/i.test(message) ||
        /duplicate column/i.test(message) ||
        /no such column\s*:\s*userid/i.test(message) ||
        /near \"do\"/i.test(message) ||
        /already exists/i.test(message);
};

const runMigrations = async ({ skipConflicts = false } = {}) => {
    const migrator = createMigrator();

    if (!skipConflicts) {
        try {
            await migrator.up();
            return;
        } catch (error) {
            console.error('Falha ao executar as migrations pendentes:', error);
            throw error;
        }
    }

    const pending = await migrator.pending();

    for (const migration of pending) {
        try {
            await migrator.up({ migrations: [migration.name] });
        } catch (error) {
            if (isIgnorableMigrationError(error)) {
                console.warn(`Ignorando migração já aplicada (${migration.name}): ${error.message}`);
                if (typeof migrator.storage?.logMigration === 'function') {
                    await migrator.storage.logMigration({ name: migration.name });
                }
                continue;
            }

            console.error(`Falha ao executar a migração ${migration.name}:`, error);
            throw error;
        }
    }
};

const synchronizeSessionStore = async () => {
    try {
        await sessionStore.sync();
    } catch (error) {
        console.error('Não foi possível inicializar a tabela de sessões:', error);
        throw error;
    }
};

const isTableMissingError = (error) => {
    const driverCode = error?.original?.code || error?.parent?.code;
    const message = [
        error?.message,
        error?.original?.message,
        error?.parent?.message
    ].filter(Boolean).join(' ') || '';

    return driverCode === 'ER_NO_SUCH_TABLE' ||
        driverCode === 'SQLITE_ERROR' ||
        driverCode === '42P01' ||
        /does not exist/i.test(message) ||
        /no such table/i.test(message) ||
        /unknown table/i.test(message) ||
        /no description found/i.test(message) ||
        /não existe/i.test(message);
};

const shouldAllowSyncFallback = () => {
    if ((process.env.NODE_ENV || '').trim().toLowerCase() === 'production') {
        return false;
    }

    const rawValue = (process.env.ALLOW_SCHEMA_SYNC_FALLBACK || '').trim().toLowerCase();
    if (!rawValue) {
        return true;
    }

    return ['1', 'true', 'yes', 'on', 'enabled'].includes(rawValue);
};

const ensureBaseSchema = async () => {
    const queryInterface = sequelize.getQueryInterface();

    try {
        await queryInterface.describeTable('Users');
        return false;
    } catch (error) {
        if (!isTableMissingError(error)) {
            throw error;
        }
    }

    if (!shouldAllowSyncFallback()) {
        throw new Error('Tabela Users ausente após migrations e fallback com sequelize.sync() desativado.');
    }

    console.warn('Tabela Users ausente após migrations; executando fallback com sequelize.sync() (apenas para ambientes não produtivos).');

    try {
        await sequelize.sync();
    } catch (error) {
        console.error('Falha ao executar fallback de sincronização automática:', error);
        throw error;
    }

    return true;
};

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
                connectSrc: ["'self'", 'ws:', 'wss:'],
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
const sessionMiddleware = session({
    name: 'sgi.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 12 * 60 * 60 * 1000
    }
});

app.use(sessionMiddleware);
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
app.use('/support', supportRoutes);


// Conexão DB
initializeSupportChat({ io, sessionMiddleware });

const initializeApplication = async () => {
    await sequelize.authenticate();
    const fallbackExecuted = await ensureBaseSchema();
    await runMigrations({ skipConflicts: fallbackExecuted });
    await ensureBaseSchema();
    await synchronizeSessionStore();

    console.log('Banco de dados autenticado e migrations executadas com sucesso!');

    server.listen(PORT, () => {
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
};

initializeApplication().catch((error) => {
    console.error('Erro ao inicializar as dependências do servidor:', error);
    process.exit(1);
});
