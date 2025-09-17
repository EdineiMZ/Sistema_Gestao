process.env.NODE_ENV = 'test';

jest.mock('../../database/models', () => ({
    Sequelize: { Op: require('sequelize').Op },
    User: {
        findByPk: jest.fn()
    },
    UserNotificationPreference: {},
    sequelize: {
        transaction: jest.fn()
    }
}));

const { User } = require('../../database/models');
const userController = require('../../src/controllers/userController');

const buildResponse = () => ({
    redirect: jest.fn()
});

describe('userController.updateProfile', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('atualiza apenas os dados permitidos do próprio usuário', async () => {
        const sessionUser = {
            id: 42,
            name: 'Cliente Original',
            email: 'cliente@example.com',
            role: 'client',
            active: true
        };

        const updatedPlain = {
            id: 42,
            name: 'Cliente Atualizado',
            email: 'cliente@example.com',
            phone: '11988887777',
            address: 'Rua Nova, 200',
            dateOfBirth: '1991-02-15',
            role: 'client',
            active: true
        };

        const userInstance = {
            id: 42,
            name: 'Cliente Original',
            email: 'cliente@example.com',
            phone: null,
            address: null,
            dateOfBirth: '1990-01-01',
            role: 'client',
            active: true,
            save: jest.fn().mockResolvedValue(undefined),
            get: jest.fn(() => updatedPlain)
        };

        User.findByPk.mockResolvedValueOnce(userInstance);

        const req = {
            user: { ...sessionUser },
            session: { user: { ...sessionUser } },
            body: {
                name: ' Cliente Atualizado ',
                phone: ' 11988887777 ',
                address: ' Rua Nova, 200 ',
                dateOfBirth: '1991-02-15',
                password: ' NovaSenha!123 ',
                email: 'ataque@example.com',
                role: 'admin'
            },
            flash: jest.fn()
        };

        const res = buildResponse();

        await userController.updateProfile(req, res);

        expect(User.findByPk).toHaveBeenCalledWith(42);
        expect(userInstance.name).toBe('Cliente Atualizado');
        expect(userInstance.phone).toBe('11988887777');
        expect(userInstance.address).toBe('Rua Nova, 200');
        expect(userInstance.dateOfBirth).toBe('1991-02-15');
        expect(userInstance.password).toBe('NovaSenha!123');
        expect(userInstance.email).toBe('cliente@example.com');
        expect(userInstance.save).toHaveBeenCalledTimes(1);

        expect(req.session.user.name).toBe('Cliente Atualizado');
        expect(req.session.user.address).toBe('Rua Nova, 200');
        expect(req.user.name).toBe('Cliente Atualizado');

        expect(req.flash).toHaveBeenCalledWith('success_msg', 'Perfil atualizado com sucesso!');
        expect(res.redirect).toHaveBeenCalledWith('/users/profile');
    });

    it('retorna mensagem de validação quando o nome é inválido', async () => {
        const sessionUser = {
            id: 55,
            name: 'Cliente Padrão',
            email: 'cliente.padrao@example.com',
            role: 'client',
            active: true
        };

        const validationError = new Error('Validation error');
        validationError.errors = [{ message: 'Nome é obrigatório.' }];

        const userInstance = {
            id: 55,
            name: 'Cliente Padrão',
            email: 'cliente.padrao@example.com',
            phone: null,
            address: null,
            dateOfBirth: null,
            role: 'client',
            active: true,
            save: jest.fn().mockRejectedValue(validationError),
            get: jest.fn()
        };

        User.findByPk.mockResolvedValueOnce(userInstance);

        const req = {
            user: { ...sessionUser },
            session: { user: { ...sessionUser } },
            body: {
                name: '  ',
                phone: '',
                address: '',
                dateOfBirth: '',
                password: ''
            },
            flash: jest.fn()
        };

        const res = buildResponse();

        await userController.updateProfile(req, res);

        expect(User.findByPk).toHaveBeenCalledWith(55);
        expect(userInstance.save).not.toHaveBeenCalled();
        expect(req.session.user.name).toBe('Cliente Padrão');
        expect(req.flash).toHaveBeenCalledWith('error_msg', 'Nome é obrigatório.');
        expect(res.redirect).toHaveBeenCalledWith('/users/profile');
    });
});
