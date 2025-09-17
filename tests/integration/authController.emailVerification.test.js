process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const crypto = require('crypto');
const argon2 = require('argon2');

jest.mock('../../database/models', () => {
    const { Op } = require('sequelize');

    return {
        User: {
            findOne: jest.fn(),
            create: jest.fn()
        },
        Sequelize: { Op },
        sequelize: { close: jest.fn() }
    };
});

jest.mock('../../src/utils/email', () => ({
    sendEmail: jest.fn()
}));

const request = require('supertest');
const { User, sequelize } = require('../../database/models');
const { sendEmail } = require('../../src/utils/email');
const { createTestApp } = require('../utils/createTestApp');

const buildMockUser = (overrides = {}) => ({
    id: overrides.id ?? 1,
    name: overrides.name ?? 'Usuário Teste',
    email: overrides.email ?? 'user@example.com',
    role: overrides.role ?? 'client',
    active: overrides.active ?? true,
    emailVerifiedAt: overrides.emailVerifiedAt ?? null,
    emailVerificationTokenHash: overrides.emailVerificationTokenHash ?? null,
    emailVerificationTokenExpiresAt: overrides.emailVerificationTokenExpiresAt ?? null,
    password: overrides.password ?? 'hashed',
    getFirstName: jest.fn(() => 'Usuário'),
    save: jest.fn(async function save() {
        return this;
    }),
    ...overrides
});

describe('AuthController - verificação de e-mail', () => {
    let app;
    let agent;

    beforeEach(() => {
        jest.clearAllMocks();
        app = createTestApp();
        agent = request.agent(app);
    });

    afterAll(async () => {
        if (sequelize && typeof sequelize.close === 'function') {
            await sequelize.close();
        }
    });

    it('envia e-mail de verificação após cadastro bem-sucedido', async () => {
        User.findOne.mockResolvedValueOnce(null);

        User.create.mockImplementationOnce(async (payload) => {
            expect(payload.emailVerificationTokenHash).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
            expect(payload.emailVerificationTokenExpiresAt).toBeInstanceOf(Date);
            return buildMockUser(payload);
        });

        const response = await agent
            .post('/register')
            .field('name', 'Usuário Teste')
            .field('email', 'novo@example.com')
            .field('password', 'Senha@123')
            .field('phone', '11999998888');

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/login');
        expect(User.create).toHaveBeenCalledTimes(1);
        expect(sendEmail).toHaveBeenCalledTimes(1);

        const [to, subject, payload] = sendEmail.mock.calls[0];
        expect(to).toBe('novo@example.com');
        expect(subject).toContain('Confirme seu e-mail');
        expect(payload.html).toContain('/verify-email?token=');

        const flash = await agent.get('/__test/flash');
        expect(flash.status).toBe(200);
        expect(flash.body.success.join(' ')).toContain('Enviamos um e-mail de verificação');
    });

    it('bloqueia login até o e-mail ser confirmado e reenviando o link', async () => {
        const hashedPassword = await argon2.hash('Senha@123');
        const mockUser = buildMockUser({ password: hashedPassword });

        User.findOne.mockResolvedValueOnce(mockUser);

        const response = await agent
            .post('/login')
            .type('form')
            .send({ email: mockUser.email, password: 'Senha@123' });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/login');
        expect(mockUser.save).toHaveBeenCalledTimes(1);
        expect(mockUser.emailVerificationTokenHash).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
        expect(sendEmail).toHaveBeenCalledTimes(1);

        const flash = await agent.get('/__test/flash');
        expect(flash.status).toBe(200);
        expect(flash.body.error.join(' ')).toContain('confirmar seu e-mail');
    });

    it('confirma o e-mail com token válido', async () => {
        const token = 'token-valido';
        const hash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        const mockUser = buildMockUser({
            emailVerificationTokenHash: hash,
            emailVerificationTokenExpiresAt: expiresAt
        });

        User.findOne.mockImplementationOnce(async ({ where }) => {
            expect(where.emailVerificationTokenHash).toBe(hash);
            return mockUser;
        });

        const response = await agent.get(`/verify-email?token=${token}`);

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/login');
        expect(mockUser.save).toHaveBeenCalledTimes(1);
        expect(mockUser.emailVerifiedAt).toBeInstanceOf(Date);
        expect(mockUser.emailVerificationTokenHash).toBeNull();
        expect(mockUser.emailVerificationTokenExpiresAt).toBeNull();
        expect(sendEmail).not.toHaveBeenCalled();

        const flash = await agent.get('/__test/flash');
        expect(flash.body.success.join(' ')).toContain('E-mail confirmado com sucesso');
    });

    it('gera novo link quando token expirou', async () => {
        const token = 'token-expirado';
        const hash = crypto.createHash('sha256').update(token).digest('hex');
        const expiredAt = new Date(Date.now() - 60 * 60 * 1000);
        const mockUser = buildMockUser({
            emailVerificationTokenHash: hash,
            emailVerificationTokenExpiresAt: expiredAt
        });

        User.findOne.mockResolvedValueOnce(mockUser);

        const response = await agent.get(`/verify-email?token=${token}`);

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/login');
        expect(mockUser.save).toHaveBeenCalledTimes(1);
        expect(sendEmail).toHaveBeenCalledTimes(1);

        const flash = await agent.get('/__test/flash');
        expect(flash.body.error.join(' ')).toContain('link de verificação expirou');
    });
});
