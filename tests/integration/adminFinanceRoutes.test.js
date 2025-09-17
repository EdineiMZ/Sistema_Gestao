process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const mockBudgetFindAll = jest.fn();
const mockBudgetCreate = jest.fn();
const mockBudgetFindOne = jest.fn();
const mockBudgetDestroy = jest.fn();

const mockCategoryFindAll = jest.fn();
const mockCategoryFindOne = jest.fn();
const mockCategoryCreate = jest.fn();

class MockValidationError extends Error {
    constructor(message, errors = []) {
        super(message);
        this.name = 'ValidationError';
        this.errors = errors;
    }
}

class MockUniqueConstraintError extends Error {
    constructor(message, errors = []) {
        super(message);
        this.name = 'UniqueConstraintError';
        this.errors = errors;
    }
}

jest.mock('../../database/models', () => ({
    Budget: {
        findAll: (...args) => mockBudgetFindAll(...args),
        create: (...args) => mockBudgetCreate(...args),
        findOne: (...args) => mockBudgetFindOne(...args),
        destroy: (...args) => mockBudgetDestroy(...args)
    },
    FinanceCategory: {
        create: (...args) => mockCategoryCreate(...args),
        scope: jest.fn(() => ({
            findAll: (...args) => mockCategoryFindAll(...args),
            findOne: (...args) => mockCategoryFindOne(...args)
        }))
    },
    Sequelize: {
        ValidationError: MockValidationError,
        UniqueConstraintError: MockUniqueConstraintError
    }
}));

const request = require('supertest');
const { USER_ROLES } = require('../../src/constants/roles');
const adminFinanceRoutes = require('../../src/routes/adminFinanceRoutes');
const { createRouterTestApp } = require('../utils/createRouterTestApp');
const { authenticateTestUser } = require('../utils/authTestUtils');

describe('Admin Finance Routes', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        app = createRouterTestApp({
            routes: [['/admin/finance', adminFinanceRoutes]]
        });
    });

    it('exige autenticação para acessar os orçamentos', async () => {
        const response = await request(app)
            .get('/admin/finance/budgets')
            .set('Accept', 'application/json');

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/login');
        expect(mockBudgetFindAll).not.toHaveBeenCalled();
    });

    it('bloqueia usuários sem permissão de administrador', async () => {
        const { agent } = await authenticateTestUser(app, {
            role: USER_ROLES.CLIENT
        });

        const response = await agent
            .get('/admin/finance/budgets')
            .set('Accept', 'application/json');

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ message: 'Acesso negado.' });
        expect(mockBudgetFindAll).not.toHaveBeenCalled();
    });

    it('lista orçamentos do administrador autenticado', async () => {
        const sampleBudget = {
            id: 10,
            monthlyLimit: '1500.00',
            thresholds: [500, 1200],
            referenceMonth: '2024-01-01',
            financeCategoryId: 3,
            userId: 42,
            category: {
                id: 3,
                name: 'Marketing',
                slug: 'marketing',
                color: '#ff6600',
                isActive: true
            }
        };
        mockBudgetFindAll.mockResolvedValueOnce([sampleBudget]);

        const { agent, user } = await authenticateTestUser(app, {
            id: 42,
            role: USER_ROLES.ADMIN
        });

        const response = await agent
            .get('/admin/finance/budgets')
            .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            data: [
                {
                    id: 10,
                    monthlyLimit: 1500,
                    thresholds: [500, 1200],
                    referenceMonth: '2024-01-01',
                    financeCategoryId: 3,
                    userId: 42,
                    category: {
                        id: 3,
                        name: 'Marketing',
                        slug: 'marketing',
                        color: '#ff6600',
                        isActive: true
                    }
                }
            ]
        });
        expect(mockBudgetFindAll).toHaveBeenCalledWith({
            where: { userId: user.id },
            include: [
                {
                    association: 'category',
                    attributes: ['id', 'name', 'slug', 'color', 'isActive']
                }
            ],
            order: [['id', 'ASC']]
        });
    });

    it('permite criar um novo orçamento', async () => {
        const createdBudget = {
            get: () => ({
                id: 11,
                monthlyLimit: 2500,
                thresholds: [1000, 2000],
                referenceMonth: '2024-02-01',
                financeCategoryId: 7,
                userId: 99,
                category: null
            })
        };
        mockBudgetCreate.mockResolvedValueOnce(createdBudget);

        const { agent, user } = await authenticateTestUser(app, {
            id: 99,
            role: USER_ROLES.ADMIN
        });

        const response = await agent
            .post('/admin/finance/budgets')
            .set('Accept', 'application/json')
            .send({
                financeCategoryId: 7,
                monthlyLimit: '2.500,00',
                thresholds: ['1000', '2000'],
                referenceMonth: '2024-02'
            });

        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
            id: 11,
            monthlyLimit: 2500,
            thresholds: [1000, 2000],
            financeCategoryId: 7,
            userId: 99,
            referenceMonth: '2024-02-01'
        });
        expect(mockBudgetCreate).toHaveBeenCalledWith({
            userId: user.id,
            financeCategoryId: 7,
            monthlyLimit: 2500,
            thresholds: [1000, 2000],
            referenceMonth: '2024-02-01'
        });
    });

    it('retorna as categorias cadastradas pelo administrador', async () => {
        const categoryInstance = {
            get: () => ({
                id: 5,
                name: 'Infraestrutura',
                slug: 'infraestrutura',
                color: '#123456',
                isActive: true,
                ownerId: 88
            })
        };
        mockCategoryFindAll.mockResolvedValueOnce([categoryInstance]);

        const { agent, user } = await authenticateTestUser(app, {
            id: 88,
            role: USER_ROLES.ADMIN
        });

        const response = await agent
            .get('/admin/finance/categories')
            .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            data: [
                {
                    id: 5,
                    name: 'Infraestrutura',
                    slug: 'infraestrutura',
                    color: '#123456',
                    isActive: true,
                    ownerId: 88
                }
            ]
        });
        expect(mockCategoryFindAll).toHaveBeenCalledWith({
            where: { ownerId: user.id },
            order: [['name', 'ASC']]
        });
    });

    it('permite desativar uma categoria existente', async () => {
        const save = jest.fn().mockResolvedValue(undefined);
        const categoryInstance = {
            id: 55,
            ownerId: 77,
            isActive: true,
            save,
            get: () => ({
                id: 55,
                name: 'Custos Fixos',
                slug: 'custos-fixos',
                color: '#abcdef',
                isActive: false,
                ownerId: 77
            })
        };
        mockCategoryFindOne.mockResolvedValueOnce(categoryInstance);

        const { agent } = await authenticateTestUser(app, {
            id: 77,
            role: USER_ROLES.ADMIN
        });

        const response = await agent
            .delete('/admin/finance/categories/55')
            .set('Accept', 'application/json');

        expect(response.status).toBe(204);
        expect(categoryInstance.isActive).toBe(false);
        expect(save).toHaveBeenCalledTimes(1);
    });
});

