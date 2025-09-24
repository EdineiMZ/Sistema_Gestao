process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const request = require('supertest');

jest.mock('../../src/middlewares/authMiddleware', () => jest.fn((req, res, next) => {
    req.session = req.session || {};
    req.user = { id: 1, role: 'admin', active: true };
    req.session.user = req.user;
    next();
}));

jest.mock('../../src/middlewares/permissionMiddleware', () => () => (req, res, next) => next());

jest.mock('../../src/middlewares/audit', () => () => (req, res, next) => next());

const financeRoutes = require('../../src/routes/financeRoutes');
const csrfProtection = require('../../src/middlewares/csrfProtection');
const { FinanceEntry, sequelize, User } = require('../../database/models');

const buildApp = () => {
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    app.use(session({
        secret: 'finance-pay-secret',
        resave: false,
        saveUninitialized: false
    }));
    app.use(flash());
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '../../src/views'));
    app.get('/test/csrf', (req, res) => {
        const token = csrfProtection.ensureCsrfToken(req, res);
        res.json({ csrfToken: token });
    });
    app.use('/finance', financeRoutes);
    return app;
};

const extractCsrfToken = (html = '') => {
    const match = html.match(/name="_csrf"\s+value="([^"]+)"/);
    return match ? match[1] : null;
};

describe('Finance routes - marcar lançamento como pago', () => {
    let app;

    beforeEach(async () => {
        await sequelize.sync({ force: true });
        await User.create({
            id: 1,
            name: 'Finance Tester',
            email: `finance-tester-${Date.now()}@example.com`,
            password: 'SenhaSegura123',
            role: 'admin',
            active: true
        });
        app = buildApp();
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('marca um lançamento pendente como pago e preserva outros recorrentes', async () => {
        const targetEntry = await FinanceEntry.create({
            description: 'Mensalidade plataforma gestão',
            type: 'payable',
            value: '890.00',
            dueDate: '2024-06-10',
            status: 'pending',
            recurring: true,
            recurringInterval: 'monthly',
            userId: 1
        });

        const siblingEntry = await FinanceEntry.create({
            description: 'Mensalidade plataforma gestão - próximo ciclo',
            type: 'payable',
            value: '890.00',
            dueDate: '2024-07-10',
            status: 'pending',
            recurring: true,
            recurringInterval: 'monthly',
            userId: 1
        });

        const agent = request.agent(app);
        const csrfResponse = await agent.get('/test/csrf');
        expect(csrfResponse.status).toBe(200);
        const csrfToken = csrfResponse.body?.csrfToken;
        expect(csrfToken).toBeTruthy();

        const payResponse = await agent
            .post(`/finance/pay/${targetEntry.id}`)
            .set('Accept', 'application/json')
            .send({ _csrf: csrfToken });

        expect(payResponse.status).toBe(200);
        expect(payResponse.body).toMatchObject({ ok: true });
        expect(payResponse.body.entry.status).toBe('paid');
        expect(typeof payResponse.body.entry.paymentDate).toBe('string');

        const today = new Date();
        const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        expect(payResponse.body.entry.paymentDate).toBe(expectedDate);

        const updatedTarget = await FinanceEntry.findByPk(targetEntry.id);
        expect(updatedTarget.status).toBe('paid');
        expect(updatedTarget.paymentDate).toBe(expectedDate);

        const untouchedSibling = await FinanceEntry.findByPk(siblingEntry.id);
        expect(untouchedSibling.status).toBe('pending');
        expect(untouchedSibling.paymentDate).toBeNull();
    });

    it('impede marcar lançamento já quitado novamente', async () => {
        const paidEntry = await FinanceEntry.create({
            description: 'Serviço de consultoria anual',
            type: 'receivable',
            value: '4500.00',
            dueDate: '2024-03-01',
            paymentDate: '2024-03-02',
            status: 'paid',
            recurring: false,
            recurringInterval: null,
            userId: 1
        });

        const agent = request.agent(app);
        const csrfResponse = await agent.get('/test/csrf');
        expect(csrfResponse.status).toBe(200);
        const csrfToken = csrfResponse.body?.csrfToken;
        expect(csrfToken).toBeTruthy();

        const payResponse = await agent
            .post(`/finance/pay/${paidEntry.id}`)
            .set('Accept', 'application/json')
            .send({ _csrf: csrfToken });

        expect(payResponse.status).toBe(400);
        expect(payResponse.body.ok).toBe(false);
        expect(payResponse.body.message).toMatch(/já foi marcado como pago/i);
    });
});
