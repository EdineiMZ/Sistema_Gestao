process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

jest.mock('../../database/models', () => ({
    User: {
        findByPk: jest.fn()
    },
    UserNotificationPreference: {},
    AuditLog: {
        create: jest.fn()
    },
    sequelize: {
        transaction: jest.fn()
    }
}));

const { User, AuditLog } = require('../../database/models');
const { USER_ROLES } = require('../../src/constants/roles');
const { createRouterTestApp } = require('../utils/createRouterTestApp');
const { authenticateTestUser } = require('../utils/authTestUtils');

const userRoutes = require('../../src/routes/userRoutes');

describe('Rotas autenticadas de perfil de usuário', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        app = createRouterTestApp({
            routes: [['/users', userRoutes]]
        });
    });

    it('exibe o formulário de perfil com os dados atuais do usuário', async () => {
        const plainUser = {
            id: 321,
            name: 'Cliente Teste',
            email: 'cliente@exemplo.com',
            phone: '11999999999',
            address: 'Rua A, 100',
            dateOfBirth: '1990-01-01',
            role: USER_ROLES.CLIENT,
            active: true
        };

        User.findByPk.mockResolvedValueOnce({
            get: jest.fn(() => plainUser)
        });

        const { agent } = await authenticateTestUser(app, {
            id: 321,
            role: USER_ROLES.CLIENT,
            name: 'Cliente Teste',
            email: 'cliente@exemplo.com'
        });

        const response = await agent.get('/users/profile');

        expect(response.status).toBe(200);
        expect(User.findByPk).toHaveBeenCalledWith(321);
        expect(response.text).toContain('Meu perfil');
        expect(response.text).toContain('cliente@exemplo.com');
        expect(response.text).toContain('Cliente Teste');
    });

    it('permite que um usuário padrão atualize o próprio perfil', async () => {
        const userInstance = {
            id: 321,
            name: 'Cliente Teste',
            email: 'cliente@exemplo.com',
            phone: '11999999999',
            address: 'Rua A, 100',
            dateOfBirth: '1990-01-01',
            role: USER_ROLES.CLIENT,
            active: true,
            save: jest.fn().mockResolvedValue(undefined),
            get: jest.fn(() => ({
                id: 321,
                name: 'Cliente Atualizado',
                email: 'cliente@exemplo.com',
                phone: '11988887777',
                address: 'Rua Nova, 200',
                dateOfBirth: '1991-02-15',
                role: USER_ROLES.CLIENT,
                active: true
            }))
        };

        User.findByPk.mockResolvedValueOnce(userInstance);

        const { agent } = await authenticateTestUser(app, {
            id: 321,
            role: USER_ROLES.CLIENT,
            name: 'Cliente Teste',
            email: 'cliente@exemplo.com'
        });

        const response = await agent
            .post('/users/profile')
            .send({
                name: ' Cliente Atualizado ',
                phone: ' 11988887777 ',
                address: ' Rua Nova, 200 ',
                dateOfBirth: '1991-02-15',
                password: ' NovaSenha!123 '
            });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/users/profile');
        expect(User.findByPk).toHaveBeenCalledWith(321);
        expect(userInstance.name).toBe('Cliente Atualizado');
        expect(userInstance.phone).toBe('11988887777');
        expect(userInstance.address).toBe('Rua Nova, 200');
        expect(userInstance.dateOfBirth).toBe('1991-02-15');
        expect(userInstance.password).toBe('NovaSenha!123');
        expect(userInstance.save).toHaveBeenCalledTimes(1);

        await new Promise((resolve) => setImmediate(resolve));
        expect(AuditLog.create).toHaveBeenCalledTimes(1);
        expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            action: 'user.profile.update',
            resource: 'User:321'
        }));
    });

    it('mantém as validações do perfil quando os dados são inválidos', async () => {
        const validationError = new Error('Validation error');
        validationError.errors = [{ message: 'Nome é obrigatório.' }];

        const failingInstance = {
            id: 321,
            name: 'Cliente Teste',
            email: 'cliente@exemplo.com',
            phone: null,
            address: null,
            dateOfBirth: null,
            role: USER_ROLES.CLIENT,
            active: true,
            save: jest.fn().mockRejectedValue(validationError),
            get: jest.fn()
        };

        User.findByPk.mockResolvedValueOnce(failingInstance);

        const { agent } = await authenticateTestUser(app, {
            id: 321,
            role: USER_ROLES.CLIENT,
            name: 'Cliente Teste',
            email: 'cliente@exemplo.com'
        });

        const response = await agent
            .post('/users/profile')
            .send({
                name: '  ',
                phone: '',
                address: '',
                dateOfBirth: '',
                password: ''
            });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/users/profile');
        await new Promise((resolve) => setImmediate(resolve));
        expect(AuditLog.create).not.toHaveBeenCalled();

        const plainUser = {
            id: 321,
            name: 'Cliente Teste',
            email: 'cliente@exemplo.com',
            phone: null,
            address: null,
            dateOfBirth: null,
            role: USER_ROLES.CLIENT,
            active: true
        };

        User.findByPk.mockResolvedValueOnce({
            get: jest.fn(() => plainUser)
        });

        const pageResponse = await agent.get('/users/profile');

        expect(pageResponse.status).toBe(200);
        expect(pageResponse.text).toContain('Nome é obrigatório.');
    });
});
