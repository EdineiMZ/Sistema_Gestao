require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
const cron = require('node-cron'); // para agendamentos de tarefas

const { sequelize, User } = require('./database/models');
const { USER_ROLES, ROLE_LABELS, ROLE_ORDER, getRoleLevel } = require('./src/constants/roles');

const APP_NAME = process.env.APP_NAME || 'Sistema de Gestão Inteligente';

// Importa o serviço de notificações
const { processNotifications } = require('./src/services/notificationService');

// Rotas
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const pagesRoutes = require('./src/routes/pagesRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const procedureRoutes = require('./src/routes/procedureRoutes');
const roomRoutes = require('./src/routes/roomRoutes');
const appointmentRoutes = require('./src/routes/appointmentRoutes');
const financeRoutes = require('./src/routes/financeRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const auditRoutes = require('./src/routes/auditRoutes');
const campaignRoutes = require('./src/routes/campaignRoutes');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'segredo';

// Segurança
app.use(helmet());
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
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    res.locals.user = null;
    res.locals.appName = APP_NAME;
    res.locals.pageTitle = APP_NAME;
    res.locals.roles = USER_ROLES;
    res.locals.roleLabels = ROLE_LABELS;
    res.locals.roleOptions = roleOptions;
    res.locals.getRoleLevel = getRoleLevel;
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

    return next();
});

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
app.use('/notifications', notificationRoutes);
app.use('/campaigns', campaignRoutes);
app.use('/audit', auditRoutes);

// Conexão DB
sequelize
    .sync()
    .then(() => {
        console.log('Banco de dados sincronizado com sucesso!');
        // Sobe o servidor
        app.listen(PORT, () => {
            console.log(`Servidor rodando em http://127.0.0.1:${PORT}`);
        });

        // Agendamos a tarefa para rodar a cada 5 minutos
        // Ajuste o cron pattern conforme necessidade
        cron.schedule('*/1 * * * *', () => {
            console.log('Executando processNotifications() a cada 1 minutos...');
            processNotifications();
        });
    })
    .catch(err => {
        console.error('Erro ao sincronizar DB:', err);
    });
