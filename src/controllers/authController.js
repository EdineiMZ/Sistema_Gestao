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

const ARGON2_HASH_OPTIONS = {
    type: argon2.argon2id,
    timeCost: parsePositiveInt(process.env.ARGON2_TIME_COST, 3),
    memoryCost: parsePositiveInt(process.env.ARGON2_MEMORY_COST, 2 ** 16),
    parallelism: parsePositiveInt(process.env.ARGON2_PARALLELISM, 1)
};

const MIN_TWO_FACTOR_CODE_TTL_SECONDS = 60;
const DEFAULT_TWO_FACTOR_CODE_TTL_SECONDS = 300;

const resolveTwoFactorTtlMs = () => {
    const configuredSeconds = parsePositiveInt(
        process.env.TWO_FACTOR_CODE_TTL_SECONDS,
        DEFAULT_TWO_FACTOR_CODE_TTL_SECONDS
    );
    const safeSeconds = Math.max(configuredSeconds, MIN_TWO_FACTOR_CODE_TTL_SECONDS);
    return safeSeconds * 1000;
};

const TWO_FACTOR_CODE_TTL_MS = resolveTwoFactorTtlMs();
const TWO_FACTOR_MAX_ATTEMPTS = 5;
const TWO_FACTOR_CODE_LENGTH = 6;

const normalizeTwoFactorCode = (value = '') => String(value).replace(/\s+/g, '').toUpperCase();

const isValidTwoFactorCode = (value) => /^[A-Z0-9]{6,32}$/.test(value);

const generateTwoFactorCode = () => {
    const upperBound = 10 ** TWO_FACTOR_CODE_LENGTH;
    return String(crypto.randomInt(0, upperBound)).padStart(TWO_FACTOR_CODE_LENGTH, '0');
};

const acceptsJson = (req) => {
    if (!req) {
        return false;
    }

    const headers = req.headers || {};
    const requestedWith = headers['x-requested-with'];
    if (typeof requestedWith === 'string') {
        const normalized = requestedWith.toLowerCase();
        if (normalized === 'xmlhttprequest' || normalized === 'fetch') {
            return true;
        }
    }

    const secFetchMode = headers['sec-fetch-mode'];
    if (typeof secFetchMode === 'string' && secFetchMode.toLowerCase() === 'cors') {
        return true;
    }

    try {
        if (
            typeof req.accepts === 'function' &&
            req.accepts(['json', 'html']) === 'json' &&
            typeof requestedWith === 'string'
        ) {
            return true;
        }
    } catch (error) {
        // ignore fallback to header inspection
    }

    return false;
};

const respondWithError = (req, res, message, statusCode = 400) => {
    if (acceptsJson(req)) {
        return res.status(statusCode).json({ error: message });
    }

    req.flash('error_msg', message);
    return res.redirect('/login');
};

const finalizeLoginSession = (req, res, user, message) => {
    req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active
    };

    if (acceptsJson(req)) {
        return res.json({ success: true, redirectUrl: '/', message: message || 'Login realizado com sucesso.' });
    }

    if (message) {
        req.flash('success_msg', message);
    } else {
        req.flash('success_msg', 'Login realizado com sucesso!');
    }

    return res.redirect('/');
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

const createTwoFactorChallenge = async ({ req, user }) => {
    if (!req || !req.session) {
        throw new Error('Sessão indisponível para criação do desafio de autenticação.');
    }

    if (!user || !user.id) {
        throw new Error('Usuário inválido para criação do desafio de autenticação.');
    }

    const code = normalizeTwoFactorCode(generateTwoFactorCode());
    const hash = await argon2.hash(code, ARGON2_HASH_OPTIONS);
    const expiresAt = Date.now() + TWO_FACTOR_CODE_TTL_MS;

    req.session.twoFactorChallenge = {
        userId: user.id,
        hash,
        expiresAt,
        attempts: 0
    };

    return { code, expiresAt: new Date(expiresAt) };
};

const sendTwoFactorCodeEmail = async ({ user, code, expiresAt }) => {
    if (!user || !user.email) {
        throw new Error('Usuário inválido para envio do código de verificação.');
    }

    const displayName = escapeHtml(getDisplayName(user));
    const formattedExpiry = formatExpiry(expiresAt);
    const subject = 'Seu código de verificação seguro';
    const textLines = [
        `Olá ${displayName},`,
        '',
        'Recebemos uma tentativa de login em sua conta e precisamos confirmar que é você.',
        'Use o código a seguir para concluir o acesso:',
        '',
        code,
        '',
        formattedExpiry
            ? `Por segurança, este código expira em ${formattedExpiry}.`
            : 'Por segurança, este código expira em poucos minutos.',
        '',
        'Caso não tenha solicitado o acesso, recomendamos alterar sua senha imediatamente.'
    ];
    const text = textLines.join('\n');

    const html = `
        <p>Olá ${displayName},</p>
        <p>Recebemos uma tentativa de login em sua conta e precisamos confirmar que é você.</p>
        <p style="margin: 24px 0; font-size: 28px; letter-spacing: 8px; font-weight: 600; text-align: center; color: #111827;">
            ${code}
        </p>
        <p>${
            formattedExpiry
                ? `Por segurança, este código expira em <strong>${formattedExpiry}</strong>.`
                : 'Por segurança, este código expira em poucos minutos.'
        }</p>
        <p style="margin-top: 24px;">Se não foi você, ignore esta mensagem e altere sua senha o quanto antes.</p>
    `;

    await sendEmail(user.email, subject, text, html);
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

    if (acceptsJson(req)) {
        return res.status(500).json({ error: FRIENDLY_DB_ERROR_MESSAGE });
    }

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
            const { email, password } = req.body || {};
            if (!email) {
                return respondWithError(req, res, 'E-mail é obrigatório para login.');
            }

            if (!password) {
                return respondWithError(req, res, 'Senha é obrigatória para login.');
            }

            if (req.session) {
                delete req.session.twoFactorChallenge;
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
                return respondWithError(req, res, 'Usuário não encontrado ou inativo.');
            }

            const passwordMatches = await argon2.verify(user.password, password);
            if (!passwordMatches) {
                return respondWithError(req, res, 'Senha incorreta.');
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

                    const message =
                        'É necessário confirmar seu e-mail antes de acessar a plataforma. Enviamos um novo link de verificação para o seu e-mail.';
                    if (acceptsJson(req)) {
                        return res.status(403).json({ error: message });
                    }

                    req.flash('error_msg', message);
                } catch (emailError) {
                    console.error('Erro ao reenviar verificação de e-mail durante o login:', emailError);
                    const message =
                        'Não foi possível reenviar o e-mail de verificação. Tente novamente em instantes.';

                    if (acceptsJson(req)) {
                        return res.status(500).json({ error: message });
                    }

                    req.flash('error_msg', message);
                }

                return res.redirect('/login');
            }

            if (user.twoFactorEnabled) {
                try {
                    const { code, expiresAt } = await createTwoFactorChallenge({ req, user });
                    await sendTwoFactorCodeEmail({ user, code, expiresAt });

                    const payload = {
                        requiresTwoFactor: true,
                        message: 'Enviamos um código de verificação para o seu e-mail corporativo.'
                    };

                    if (acceptsJson(req)) {
                        return res.json({ ...payload, expiresAt: expiresAt?.toISOString() || null });
                    }

                    req.flash('success_msg', payload.message);
                    return res.redirect('/login');
                } catch (twoFactorError) {
                    console.error('Erro ao gerar ou enviar código de verificação em duas etapas:', twoFactorError);
                    return respondWithError(
                        req,
                        res,
                        'Não foi possível gerar o código de verificação. Tente novamente em instantes.',
                        500
                    );
                }
            }

            return finalizeLoginSession(req, res, user, 'Login realizado com sucesso!');
        } catch (err) {
            console.error('Erro no login:', err);

            if (acceptsJson(req)) {
                return res.status(500).json({ error: 'Erro ao fazer login.' });
            }

            req.flash('error_msg', 'Erro ao fazer login.');
            return res.redirect('/login');
        }
    },

    verifyTwoFactor: async (req, res) => {
        try {
            const { code } = req.body || {};
            const challenge = req.session?.twoFactorChallenge;

            if (!challenge || !challenge.userId || !challenge.hash) {
                return respondWithError(
                    req,
                    res,
                    'Sessão de verificação expirada. Inicie o login novamente.',
                    440
                );
            }

            const normalizedCode = normalizeTwoFactorCode(code);
            if (!normalizedCode) {
                return respondWithError(req, res, 'Informe o código enviado para o seu e-mail corporativo.');
            }

            if (!isValidTwoFactorCode(normalizedCode)) {
                return respondWithError(
                    req,
                    res,
                    'O código de verificação deve conter entre 6 e 32 caracteres alfanuméricos.'
                );
            }

            const expirationTimestamp = Number(challenge.expiresAt);
            if (Number.isFinite(expirationTimestamp) && Date.now() > expirationTimestamp) {
                if (req.session) {
                    delete req.session.twoFactorChallenge;
                }
                return respondWithError(
                    req,
                    res,
                    'O código informado expirou. Refaça o login para gerar um novo código.',
                    410
                );
            }

            const attempts = Number.isFinite(Number(challenge.attempts))
                ? Number(challenge.attempts)
                : 0;

            if (attempts >= TWO_FACTOR_MAX_ATTEMPTS) {
                if (req.session) {
                    delete req.session.twoFactorChallenge;
                }
                return respondWithError(
                    req,
                    res,
                    'Número de tentativas excedido. Inicie o login novamente.',
                    429
                );
            }

            const isValid = await argon2.verify(challenge.hash, normalizedCode);
            if (!isValid) {
                const updatedAttempts = attempts + 1;
                if (req.session) {
                    if (updatedAttempts >= TWO_FACTOR_MAX_ATTEMPTS) {
                        delete req.session.twoFactorChallenge;
                    } else {
                        req.session.twoFactorChallenge = {
                            ...challenge,
                            attempts: updatedAttempts
                        };
                    }
                }

                const remainingAttempts = Math.max(TWO_FACTOR_MAX_ATTEMPTS - updatedAttempts, 0);
                const message =
                    remainingAttempts > 0
                        ? `Código inválido. Você ainda possui ${remainingAttempts} tentativa${
                              remainingAttempts > 1 ? 's' : ''
                          }.`
                        : 'Código inválido. Inicie o processo de login novamente para gerar um novo código.';

                if (acceptsJson(req)) {
                    return res.status(401).json({ error: message, remainingAttempts });
                }

                req.flash('error_msg', message);
                return res.redirect('/login');
            }

            let user;
            try {
                user = await User.findOne({ where: { id: challenge.userId, active: true } });
            } catch (error) {
                return handleDatabaseError(
                    error,
                    req,
                    res,
                    '/login',
                    'Erro ao buscar usuário para concluir login com 2FA.'
                );
            }

            if (!user) {
                if (req.session) {
                    delete req.session.twoFactorChallenge;
                }
                return respondWithError(
                    req,
                    res,
                    'Usuário não encontrado ou inativo. Inicie o login novamente.'
                );
            }

            if (!user.emailVerifiedAt) {
                if (req.session) {
                    delete req.session.twoFactorChallenge;
                }
                return respondWithError(
                    req,
                    res,
                    'Confirme seu e-mail antes de concluir o login.'
                );
            }

            if (req.session) {
                delete req.session.twoFactorChallenge;
            }

            return finalizeLoginSession(req, res, user, 'Login concluído com verificação em duas etapas.');
        } catch (error) {
            console.error('Erro ao validar código de verificação em duas etapas:', error);

            if (acceptsJson(req)) {
                return res.status(500).json({ error: 'Não foi possível validar o código. Tente novamente em instantes.' });
            }

            req.flash('error_msg', 'Não foi possível validar o código. Tente novamente em instantes.');
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
            const {
                name,
                email,
                password,
                phone,
                address,
                dateOfBirth,
                twoFactorEnabled: rawTwoFactorEnabled,
                twoFactorCode
            } = req.body;

            const wantsTwoFactor = ['on', 'true', '1', 'yes'].includes(
                String(rawTwoFactorEnabled || '').toLowerCase()
            );
            const normalizedTwoFactorCode = wantsTwoFactor
                ? normalizeTwoFactorCode(twoFactorCode)
                : '';

            if (wantsTwoFactor) {
                if (!normalizedTwoFactorCode) {
                    req.flash('error_msg', 'Informe um código de verificação para habilitar o 2FA.');
                    return res.redirect('/register');
                }

                if (!isValidTwoFactorCode(normalizedTwoFactorCode)) {
                    req.flash('error_msg', 'O código de 2FA deve conter entre 6 e 32 caracteres alfanuméricos.');
                    return res.redirect('/register');
                }
            }

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
                let twoFactorCodeHash = null;
                if (wantsTwoFactor) {
                    twoFactorCodeHash = await argon2.hash(normalizedTwoFactorCode, ARGON2_HASH_OPTIONS);
                }

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
                    emailVerifiedAt: null,
                    twoFactorEnabled: wantsTwoFactor,
                    twoFactorCodeHash
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
