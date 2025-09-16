process.env.NODE_ENV = 'test';

const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const request = require('supertest');

const { createFilterValidation } = require('../../src/middlewares/queryValidationMiddleware');

describe('queryValidationMiddleware.createFilterValidation', () => {
    let app;

    beforeEach(() => {
        app = express();
        app.use(express.urlencoded({ extended: true }));
        app.use(express.json());
        app.use(session({
            secret: 'test-secret',
            resave: false,
            saveUninitialized: false
        }));
        app.use(flash());

        const pipeline = createFilterValidation({
            allowedStatuses: ['active', 'inactive'],
            redirectTo: '/users/manage'
        });

        app.get('/manage', pipeline, (req, res) => {
            res.json({ ok: true, query: req.query });
        });

        app.get('/flash', (req, res) => {
            res.json({ error: req.flash('error_msg') });
        });
    });

    it('permite filtros válidos e segue para a próxima função', async () => {
        const agent = request.agent(app);
        const response = await agent
            .get('/manage')
            .set('Accept', 'text/html')
            .query({
                status: 'active',
                startDate: '2024-01-01',
                endDate: '2024-01-31',
                keyword: 'John Doe'
            });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            ok: true,
            query: {
                status: 'active',
                startDate: '2024-01-01',
                endDate: '2024-01-31',
                keyword: 'John Doe'
            }
        });
    });

    it('rejeita status inválido, redireciona e envia feedback por flash message', async () => {
        const agent = request.agent(app);
        const response = await agent
            .get('/manage')
            .redirects(0)
            .set('Accept', 'text/html')
            .query({ status: 'blocked' });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/users/manage');

        const flashResponse = await agent.get('/flash');
        expect(flashResponse.status).toBe(200);
        expect(flashResponse.body.error[0]).toMatch(/Parâmetros de filtro inválidos|Status inválido/);
    });
});
