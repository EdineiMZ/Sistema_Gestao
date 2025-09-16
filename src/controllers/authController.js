// src/controllers/authController.js
const { User, Sequelize } = require('../../database/models');
const bcrypt = require('bcrypt');
const { USER_ROLES } = require('../constants/roles');

const FRIENDLY_DB_ERROR_MESSAGE = 'Estamos atualizando o sistema. Execute as migrações do banco de dados e tente novamente.';

const isSequelizeDatabaseError = (error) => {
    if (!error) {
        return false;
    }
    if (error.name === 'SequelizeDatabaseError') {
        return true;
    }
    return Boolean(Sequelize?.DatabaseError) && error instanceof Sequelize.DatabaseError;
};

const handleDatabaseError = (error, req, res, redirectPath, contextMessage) => {
    if (!isSequelizeDatabaseError(error)) {
        throw error;
    }

    console.error(
        `${contextMessage} Execute as migrações do banco antes de tentar novamente (ex.: npx sequelize-cli db:migrate).`,
        error
    );
    req.flash('error_msg', FRIENDLY_DB_ERROR_MESSAGE);
    return res.redirect(redirectPath);
};

module.exports = {
    // Renderiza a página de login
    showLogin: (req, res) => {
        res.render('auth/login', { pageTitle: 'Entrar na plataforma' });
    },

    // Lida com o POST de login
    login: async (req, res) => {
        try {
            const { email, password } = req.body;
            if (!email) {
                req.flash('error_msg', 'E-mail é obrigatório para login.');
                return res.redirect('/login');
            }
            let user;
            try {
                user = await User.findOne({ where: { email, active: true } });
            } catch (error) {
                return handleDatabaseError(
                    error,
                    req,
                    res,
                    '/login',
                    'Erro ao buscar usuário para login.'
                );
            }
            if (!user) {
                req.flash('error_msg', 'Usuário não encontrado ou inativo.');
                return res.redirect('/login');
            }
            const match = await bcrypt.compare(password, user.password);
            if (!match) {
                req.flash('error_msg', 'Senha incorreta.');
                return res.redirect('/login');
            }
            req.session.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                active: user.active
            };
            req.flash('success_msg', 'Login realizado com sucesso!');
            return res.redirect('/');
        } catch (err) {
            console.error('Erro no login:', err);
            req.flash('error_msg', 'Erro ao fazer login.');
            return res.redirect('/login');
        }
    },

    // Renderiza a página de registro
    showRegister: (req, res) => {
        res.render('auth/register', { pageTitle: 'Criar conta' });
    },

    // Lida com o POST de registro
    register: async (req, res) => {
        try {
            const { name, email, password, phone, address, dateOfBirth } = req.body;

            if (!email) {
                req.flash('error_msg', 'E-mail é obrigatório.');
                return res.redirect('/register');
            }

            let existingUser;
            try {
                existingUser = await User.findOne({ where: { email } });
            } catch (error) {
                return handleDatabaseError(
                    error,
                    req,
                    res,
                    '/register',
                    'Erro ao verificar usuário existente durante o cadastro.'
                );
            }
            if (existingUser) {
                req.flash('error_msg', 'E-mail já cadastrado.');
                return res.redirect('/register');
            }

            let profileBuffer = null;
            if (req.file) {
                profileBuffer = req.file.buffer;
            }

            try {
                await User.create({
                    name,
                    email,
                    password, // Criptografado via hook no model
                    phone,
                    address,
                    dateOfBirth,
                    role: USER_ROLES.CLIENT,
                    profileImage: profileBuffer
                });
            } catch (error) {
                return handleDatabaseError(
                    error,
                    req,
                    res,
                    '/register',
                    'Erro ao criar usuário durante o cadastro.'
                );
            }

            req.flash('success_msg', 'Cadastro realizado com sucesso! Faça login.');
            return res.redirect('/login');
        } catch (err) {
            console.error('Erro no registro:', err);
            req.flash('error_msg', 'Erro ao cadastrar usuário.');
            return res.redirect('/register');
        }
    },

    // Efetua logout
    logout: (req, res) => {
        req.session.destroy((err) => {
            if (err) console.error('Erro ao destruir a sessão:', err);
            return res.redirect('/login');
        });
    }
};
