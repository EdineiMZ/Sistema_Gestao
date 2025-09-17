// src/controllers/authController.js
const crypto = require('crypto');

const { User, Sequelize } = require('../../database/models');
const argon2 = require('argon2');
const { USER_ROLES } = require('../constants/roles');
const { sendEmail } = require('../utils/email');

const FRIENDLY_DB_ERROR_MESSAGE = 'Estamos atualizando o sistema. Execute as migrações do banco de dados e tente novamente.';
const DEFAULT_EMAIL_VERIFICATION_TTL_HOURS = 24;
const MIN_EMAIL_VERIFICATION_TTL_HOURS = 1;

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (match) => {
    switch (match) {
        case '&':
            return '&amp;';
        case '<':
            return '&lt;';
        case '>':
            return '&gt;';
        case '"':
            return '&quot;';
        case '\'':
            return '&#39;';
        default:
            return match;
    }
});

const parsePositiveInt = (value, fallback) => {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveVerificationTtlMs = () => {
    const configuredHours = parsePositiveInt(
        process.env.EMAIL_VERIFICATION_TTL_HOURS,
        DEFAULT_EMAIL_VERIFICATION_TTL_HOURS
    );
    const safeHours = Math.max(configuredHours, MIN_EMAIL_VERIFICATION_TTL_HOURS);
    return safeHours * 60 * 60 * 1000;
};

const EMAIL_VERIFICATION_TOKEN_TTL_MS = resolveVerificationTtlMs();

const createEmailVerificationToken = () => {
    const token = crypto.randomBytes(40).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS);

    return { token, hash, expiresAt };
};

const resolveAppBaseUrl = (req) => {
    const envBaseUrl = process.env.APP_BASE_URL || process.env.APP_URL || process.env.PUBLIC_APP_URL;
    if (envBaseUrl) {
        try {
            const normalized = new URL(envBaseUrl);
            const trailingSlashlessPath = normalized.pathname.replace(/\/$/, '');
            return `${normalized.origin}${trailingSlashlessPath}`;
        } catch (error) {
            console.warn('APP_BASE_URL inválida, utilizando URL da requisição.', error);
        }
    }

    if (!req) {
        return null;
    }

    const host = typeof req.get === 'function' ? req.get('host') : null;
    if (!host) {
        return null;
    }

    const protocol = req.protocol || 'http';
    return `${protocol}://${host}`;
};

const buildVerificationUrl = (req, token) => {
    const relativePath = `/verify-email?token=${encodeURIComponent(token)}`;
    const baseUrl = resolveAppBaseUrl(req);

    if (!baseUrl) {
        return relativePath;
    }

    try {
        return new URL(relativePath, `${baseUrl.replace(/\/$/, '')}/`).toString();
    } catch (error) {
        console.warn('Falha ao construir URL absoluta de verificação. Usando caminho relativo.', error);
        return relativePath;
    }
};

const formatExpiry = (expiresAt) => {
    if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
        return null;
    }

    try {
        return new Intl.DateTimeFormat('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short'
        }).format(expiresAt);
    } catch (error) {
        return expiresAt.toISOString();
    }
};

const getDisplayName = (user) => {
    if (user && typeof user.getFirstName === 'function') {
        const firstName = user.getFirstName();
        if (firstName) {
            return firstName;
        }
    }

    if (user && user.name) {
        const segments = String(user.name).trim().split(/\s+/);
        if (segments.length) {
            return segments[0];
        }
    }

    return 'usuário';
};

const sendVerificationEmail = async ({ user, req, token, expiresAt, isResend = false }) => {
    if (!user || !user.email) {
        throw new Error('Usuário inválido para envio de verificação.');
    }

    const verificationUrl = buildVerificationUrl(req, token);
    const displayName = escapeHtml(getDisplayName(user));
    const formattedExpiry = formatExpiry(expiresAt);

    const subject = isResend
        ? 'Reenvio: confirme seu e-mail para acessar a plataforma'
        : 'Confirme seu e-mail para acessar a plataforma';

    const textLines = [
        `Olá ${displayName},`,
        '',
        'Precisamos confirmar seu endereço de e-mail para liberar o acesso à plataforma.',
        `Clique no link a seguir para validar sua conta: ${verificationUrl}`
    ];

    if (formattedExpiry) {
        textLines.push('', `O link é válido até ${formattedExpiry}.`);
    }

    textLines.push('', 'Se você não solicitou este acesso, ignore esta mensagem.');

    const html = `
        <p>Olá ${displayName},</p>
        <p>Precisamos confirmar seu endereço de e-mail para liberar o acesso à plataforma.</p>
        <p><a href="${verificationUrl}">Clique aqui para validar sua conta</a>.</p>
        ${formattedExpiry ? `<p>O link é válido até <strong>${escapeHtml(formattedExpiry)}</strong>.</p>` : ''}
        <p>Se você não solicitou este acesso, ignore esta mensagem.</p>
    `;

    await sendEmail(user.email, subject, {
        html,
        text: textLines.join('\n'),
        headers: {
            'X-Transactional-Email': 'verification'
        }
    });
};

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
            const match = await argon2.verify(user.password, password);
            if (!match) {
                req.flash('error_msg', 'Senha incorreta.');
                return res.redirect('/login');
            }

            if (!user.emailVerifiedAt) {
                try {
                    const { token, hash, expiresAt } = createEmailVerificationToken();
                    user.emailVerificationTokenHash = hash;
                    user.emailVerificationTokenExpiresAt = expiresAt;
                    await user.save({
                        fields: ['emailVerificationTokenHash', 'emailVerificationTokenExpiresAt']
                    });

                    await sendVerificationEmail({
                        user,
                        req,
                        token,
                        expiresAt,
                        isResend: true
                    });

                    req.flash(
                        'error_msg',
                        'É necessário confirmar seu e-mail antes de acessar a plataforma. Enviamos um novo link de verificação para o seu e-mail.'
                    );
                } catch (emailError) {
                    console.error('Erro ao reenviar verificação de e-mail durante o login:', emailError);
                    req.flash(
                        'error_msg',
                        'Não foi possível reenviar o e-mail de verificação. Tente novamente em instantes.'
                    );
                }

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

            const { token, hash, expiresAt } = createEmailVerificationToken();

            try {
                const createdUser = await User.create({
                    name,
                    email,
                    password, // Criptografado via hook no model
                    phone,
                    address,
                    dateOfBirth,
                    role: USER_ROLES.CLIENT,
                    profileImage: profileBuffer,
                    emailVerificationTokenHash: hash,
                    emailVerificationTokenExpiresAt: expiresAt,
                    emailVerifiedAt: null
                });

                try {
                    await sendVerificationEmail({
                        user: createdUser,
                        req,
                        token,
                        expiresAt,
                        isResend: false
                    });

                    req.flash(
                        'success_msg',
                        'Cadastro realizado! Enviamos um e-mail de verificação para ativar sua conta.'
                    );
                } catch (emailError) {
                    console.error('Erro ao enviar e-mail de verificação durante o cadastro:', emailError);
                    req.flash(
                        'error_msg',
                        'Cadastro realizado, mas não foi possível enviar o e-mail de verificação. Tente novamente em alguns instantes.'
                    );
                }

                return res.redirect('/login');
            } catch (error) {
                return handleDatabaseError(
                    error,
                    req,
                    res,
                    '/register',
                    'Erro ao criar usuário durante o cadastro.'
                );
            }
        } catch (err) {
            console.error('Erro no registro:', err);
            req.flash('error_msg', 'Erro ao cadastrar usuário.');
            return res.redirect('/register');
        }
    },

    verifyEmail: async (req, res) => {
        const token = (req.query.token || '').trim();

        if (!token) {
            req.flash('error_msg', 'Token de verificação inválido.');
            return res.redirect('/login');
        }

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        let user;
        try {
            user = await User.findOne({
                where: {
                    emailVerificationTokenHash: tokenHash
                }
            });
        } catch (error) {
            return handleDatabaseError(
                error,
                req,
                res,
                '/login',
                'Erro ao buscar usuário para verificação de e-mail.'
            );
        }

        if (!user) {
            req.flash('error_msg', 'Token de verificação inválido ou já utilizado.');
            return res.redirect('/login');
        }

        if (user.emailVerifiedAt) {
            req.flash('success_msg', 'Seu e-mail já está confirmado. Faça login para continuar.');
            return res.redirect('/login');
        }

        const now = new Date();
        if (user.emailVerificationTokenExpiresAt && user.emailVerificationTokenExpiresAt < now) {
            try {
                const { token: newToken, hash: newHash, expiresAt: newExpiresAt } = createEmailVerificationToken();
                user.emailVerificationTokenHash = newHash;
                user.emailVerificationTokenExpiresAt = newExpiresAt;
                await user.save({
                    fields: ['emailVerificationTokenHash', 'emailVerificationTokenExpiresAt']
                });

                await sendVerificationEmail({
                    user,
                    req,
                    token: newToken,
                    expiresAt: newExpiresAt,
                    isResend: true
                });

                req.flash(
                    'error_msg',
                    'O link de verificação expirou. Enviamos um novo e-mail com um link atualizado.'
                );
            } catch (emailError) {
                console.error('Erro ao reenviar verificação de e-mail após expiração:', emailError);
                req.flash(
                    'error_msg',
                    'O link de verificação expirou e não foi possível gerar um novo no momento. Tente novamente mais tarde.'
                );
            }

            return res.redirect('/login');
        }

        try {
            user.emailVerifiedAt = now;
            user.emailVerificationTokenHash = null;
            user.emailVerificationTokenExpiresAt = null;
            await user.save({
                fields: ['emailVerifiedAt', 'emailVerificationTokenHash', 'emailVerificationTokenExpiresAt']
            });

            req.flash('success_msg', 'E-mail confirmado com sucesso! Faça login para continuar.');
        } catch (error) {
            return handleDatabaseError(
                error,
                req,
                res,
                '/login',
                'Erro ao confirmar e-mail do usuário.'
            );
        }

        return res.redirect('/login');
    },

    // Efetua logout
    logout: (req, res) => {
        req.session.destroy((err) => {
            if (err) console.error('Erro ao destruir a sessão:', err);
            return res.redirect('/login');
        });
    }
};
