process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const request = require('supertest');

jest.mock('../../database/models', () => {
    const actual = jest.requireActual('../../database/models');
    return {
        ...actual,
        User: {
            findOne: jest.fn(),
            create: jest.fn()
        }
    };
});

const { User, sequelize } = require('../../database/models');
const { createTestApp } = require('../utils/createTestApp');

let consoleErrorSpy;

const buildDatabaseError = (message) => {
    const error = new Error(message);
    error.name = 'SequelizeDatabaseError';
    return error;
};

describe('AuthController - tratamento de erros de banco de dados', () => {
    let app;

    beforeAll(() => {
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    beforeEach(() => {
        jest.clearAllMocks();
        app = createTestApp();
    });

    afterEach(() => {
        consoleErrorSpy.mockClear();
    });

    afterAll(async () => {
        consoleErrorSpy.mockRestore();
        await sequelize.close();
    });

    it('retorna mensagem amigável quando falha ao buscar usuário no login', async () => {
        const agent = request.agent(app);
        User.findOne.mockRejectedValueOnce(
            buildDatabaseError('SQLITE_ERROR: no such column: active')
        );

        const response = await agent
            .post('/login')
            .type('form')
            .send({ email: 'user@example.com', password: 'Senha@123' });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/login');
        expect(User.findOne).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining(
                'Erro ao buscar usuário para login. Execute as migrações do banco antes de tentar novamente'
            ),
            expect.objectContaining({
                message: 'SQLITE_ERROR: no such column: active'
            })
        );

        const flash = await agent.get('/__test/flash');
        expect(flash.status).toBe(200);
        expect(flash.body.error).toContain(
            'Estamos atualizando o sistema. Execute as migrações do banco de dados e tente novamente.'
        );
    });

    it('retorna mensagem amigável quando falha ao criar usuário no cadastro', async () => {
        const agent = request.agent(app);

        User.findOne.mockResolvedValueOnce(null);
        User.create.mockRejectedValueOnce(
            buildDatabaseError('SQLITE_ERROR: no such column: phone')
        );

        const response = await agent
            .post('/register')
            .field('name', 'Usuário Teste')
            .field('email', 'novo@example.com')
            .field('password', 'Senha@123')
            .field('phone', '11999998888')
            .field('address', 'Rua A, 123')
            .field('dateOfBirth', '1990-01-01');

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/register');
        expect(User.findOne).toHaveBeenCalledTimes(1);
        expect(User.create).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining(
                'Erro ao criar usuário durante o cadastro. Execute as migrações do banco antes de tentar novamente'
            ),
            expect.objectContaining({
                message: 'SQLITE_ERROR: no such column: phone'
            })
        );

        const flash = await agent.get('/__test/flash');
        expect(flash.status).toBe(200);
        expect(flash.body.error).toContain(
            'Estamos atualizando o sistema. Execute as migrações do banco de dados e tente novamente.'
        );
    });
});

