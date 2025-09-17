process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const path = require('path');
const request = require('supertest');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');

jest.mock('../../src/middlewares/authMiddleware', () => jest.fn((req, res, next) => {
    req.session = req.session || {};
    req.user = { id: 1, active: true, role: 'admin' };
    req.session.user = req.user;
    next();
}));

jest.mock('../../src/middlewares/permissionMiddleware', () => () => (req, res, next) => next());

jest.mock('../../src/middlewares/audit', () => () => (req, res, next) => next());

const financeRoutes = require('../../src/routes/financeRoutes');
const { FinanceEntry, sequelize } = require('../../database/models');

const buildTestApp = () => {
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    app.use(session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false
    }));
    app.use(flash());
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '../../src/views'));
    app.use('/finance', financeRoutes);
    return app;
};

describe('Fluxo de importação financeira', () => {
    let app;

    beforeAll(async () => {
        await sequelize.sync({ force: true });
        app = buildTestApp();
    });

    beforeEach(async () => {
        await FinanceEntry.destroy({ where: {} });
        await FinanceEntry.create({
            description: 'Mensalidade Academia',
            type: 'receivable',
            value: 2500,
            dueDate: '2024-01-15',
            status: 'paid'
        });
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('realiza a pré-visualização e a importação dos lançamentos válidos', async () => {
        const csvPayload = [
            'Descrição;Valor;Data;Tipo',
            'Conta de Luz;-150,30;10/01/2024;Despesa',
            'Mensalidade Academia;2500;2024-01-15;Receita'
        ].join('\n');

        const previewResponse = await request(app)
            .post('/finance/import/preview')
            .set('Accept', 'application/json')
            .attach('importFile', Buffer.from(csvPayload, 'utf8'), 'import.csv');

        expect(previewResponse.status).toBe(200);
        expect(previewResponse.body).toHaveProperty('preview');

        const { preview } = previewResponse.body;
        expect(preview.entries).toHaveLength(2);
        expect(preview.totals).toMatchObject({ total: 2, new: 1, conflicting: 1 });

        const commitPayload = {
            entries: preview.entries.map((entry) => ({
                include: !entry.conflict,
                description: entry.description,
                type: entry.type,
                value: entry.value,
                dueDate: entry.dueDate,
                status: entry.status,
                paymentDate: entry.paymentDate || ''
            }))
        };

        const commitResponse = await request(app)
            .post('/finance/import/commit')
            .set('Accept', 'application/json')
            .send(commitPayload);

        expect(commitResponse.status).toBe(201);
        expect(commitResponse.body.summary).toMatchObject({
            created: 1,
            duplicates: 0,
            invalid: 0,
            skipped: 1,
            totalReceived: 2
        });

        const entries = await FinanceEntry.findAll({ order: [['dueDate', 'ASC']] });
        expect(entries).toHaveLength(2);

        const [firstEntry, secondEntry] = entries;
        expect(firstEntry).toMatchObject({
            description: 'Conta de Luz',
            type: 'payable',
            value: expect.anything(),
            dueDate: '2024-01-10'
        });
        expect(secondEntry).toMatchObject({
            description: 'Mensalidade Academia',
            dueDate: '2024-01-15'
        });
    });
});
