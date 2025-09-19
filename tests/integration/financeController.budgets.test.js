process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const request = require('supertest');

jest.mock('../../src/middlewares/authMiddleware', () => jest.fn((req, res, next) => {
    req.session = req.session || {};
    const user = global.__TEST_FINANCE_USER__ || { id: 1, role: 'admin', active: true };
    req.user = user;
    req.session.user = user;
    next();
}));

jest.mock('../../src/middlewares/permissionMiddleware', () => () => (req, res, next) => next());

jest.mock('../../src/middlewares/audit', () => () => (req, res, next) => next());

const financeRoutes = require('../../src/routes/financeRoutes');
const { sequelize, User, FinanceCategory, Budget } = require('../../database/models');
const { USER_ROLES } = require('../../src/constants/roles');

const buildApp = () => {
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    app.use(session({
        secret: 'finance-budgets-secret',
        resave: false,
        saveUninitialized: false
    }));
    app.use(flash());
    app.use('/finance', financeRoutes);
    return app;
};

describe('FinanceController budgets endpoints', () => {
    let app;
    let user;
    let category;

    beforeEach(async () => {
        await sequelize.sync({ force: true });
        const uniqueSuffix = Date.now();
        user = await User.create({
            name: 'Admin Budget',
            email: `admin-budget-${uniqueSuffix}@example.com`,
            password: 'SenhaSegura123',
            role: USER_ROLES.ADMIN,
            active: true
        });

        category = await FinanceCategory.scope('all').create({
            name: 'Marketing Digital',
            slug: `marketing-${uniqueSuffix}`,
            color: '#2563eb',
            ownerId: user.id
        });

        global.__TEST_FINANCE_USER__ = { id: user.id, role: USER_ROLES.ADMIN, active: true };
        app = buildApp();
    });

    afterEach(() => {
        global.__TEST_FINANCE_USER__ = null;
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('cria um orçamento financeiro com thresholds válidos', async () => {
        const response = await request(app)
            .post('/finance/budgets')
            .send({
                financeCategoryId: category.id,
                monthlyLimit: '1250.55',
                thresholds: [0.5, 0.75, 0.9],
                referenceMonth: '2024-09-01'
            });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
            financeCategoryId: category.id,
            monthlyLimit: 1250.55,
            referenceMonth: '2024-09-01'
        });
        expect(response.body.thresholds).toEqual([0.5, 0.75, 0.9]);

        const budget = await Budget.findOne({ where: { userId: user.id, financeCategoryId: category.id } });
        expect(budget).toBeTruthy();
        expect(Number(budget.monthlyLimit)).toBeCloseTo(1250.55);
        expect(budget.thresholds).toEqual([0.5, 0.75, 0.9]);
    });

    it('retorna 400 quando a lista de thresholds está vazia', async () => {
        const response = await request(app)
            .post('/finance/budgets')
            .send({
                financeCategoryId: category.id,
                monthlyLimit: '800.00',
                thresholds: []
            });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ message: 'Informe ao menos um limite de alerta maior que zero.' });
    });

    it('retorna 400 quando algum threshold não é positivo', async () => {
        const response = await request(app)
            .post('/finance/budgets')
            .send({
                financeCategoryId: category.id,
                monthlyLimit: '900.00',
                thresholds: [0.5, 0]
            });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ message: 'Cada limite de alerta deve ser um número maior que zero.' });
    });

    it('atualiza um orçamento existente com dados válidos', async () => {
        const initialBudget = await Budget.create({
            userId: user.id,
            financeCategoryId: category.id,
            monthlyLimit: 950.0,
            thresholds: [0.5],
            referenceMonth: '2024-08-01'
        });

        const response = await request(app)
            .put(`/finance/budgets/${initialBudget.id}`)
            .send({
                monthlyLimit: '1800.10',
                thresholds: [0.6, 0.85],
                referenceMonth: '2024-10-01'
            });

        expect(response.status).toBe(200);
        expect(response.body.thresholds).toEqual([0.6, 0.85]);
        expect(response.body.monthlyLimit).toBe(1800.1);
        expect(response.body.referenceMonth).toBe('2024-10-01');

        await initialBudget.reload();
        expect(Number(initialBudget.monthlyLimit)).toBeCloseTo(1800.1);
        expect(initialBudget.thresholds).toEqual([0.6, 0.85]);
        expect(initialBudget.referenceMonth).toBe('2024-10-01');
    });

    it('retorna 400 ao tentar atualizar com thresholds inválidos', async () => {
        const initialBudget = await Budget.create({
            userId: user.id,
            financeCategoryId: category.id,
            monthlyLimit: 600.0,
            thresholds: [0.5]
        });

        const response = await request(app)
            .put(`/finance/budgets/${initialBudget.id}`)
            .send({ thresholds: [0.4, -1.5] });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ message: 'Cada limite de alerta deve ser um número maior que zero.' });
    });

    it('lista os orçamentos existentes com paginação padrão', async () => {
        await Budget.create({
            userId: user.id,
            financeCategoryId: category.id,
            monthlyLimit: 500.75,
            thresholds: [0.5, 0.8],
            referenceMonth: '2024-09-01'
        });

        const response = await request(app)
            .get('/finance/budgets');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0]).toMatchObject({
            userId: user.id,
            financeCategoryId: category.id,
            referenceMonth: '2024-09-01'
        });
        expect(response.body.data[0].monthlyLimit).toBeCloseTo(500.75);
        expect(response.body.data[0].thresholds).toEqual([0.5, 0.8]);
        expect(response.body.pagination).toEqual({
            page: 1,
            pageSize: 25,
            totalItems: 1,
            totalPages: 1
        });
    });
});
