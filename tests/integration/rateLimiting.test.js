const express = require('express');
const session = require('express-session');
const request = require('supertest');

const {
    createGeneralRateLimiter,
    createLoginRateLimiter
} = require('../../src/middlewares/rateLimiters');

const buildTestApp = () => {
    const app = express();

    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());

    app.use(session({
        secret: 'rate-limit-test',
        resave: false,
        saveUninitialized: false
    }));

    const generalLimiter = createGeneralRateLimiter();
    const loginLimiter = createLoginRateLimiter();

    app.use(generalLimiter);

    app.post('/login', loginLimiter, (req, res) => {
        res.status(401).json({ message: 'Credenciais inválidas' });
    });

    app.post('/__test/login', (req, res) => {
        req.session.user = { id: 1, name: 'Tester' };
        res.status(204).end();
    });

    app.get('/dashboard', (req, res) => {
        if (!req.session.user) {
            return res.status(401).json({ message: 'Usuário não autenticado' });
        }

        return res.json({ ok: true });
    });

    app.get('/assets/app.js', (req, res) => {
        res.type('application/javascript').send('console.log("ok");');
    });

    return app;
};

describe('Rate limiters', () => {
    it('throttles repeated login attempts while allowing static asset delivery', async () => {
        const app = buildTestApp();
        const agent = request.agent(app);

        for (let attempt = 0; attempt < 10; attempt += 1) {
            const response = await agent
                .post('/login')
                .send({ email: 'user@example.com', password: 'wrong' });

            expect(response.status).toBe(401);
        }

        const blockedResponse = await agent
            .post('/login')
            .send({ email: 'user@example.com', password: 'wrong' });

        expect(blockedResponse.status).toBe(429);
        expect(blockedResponse.body).toMatchObject({
            message: expect.stringContaining('login')
        });

        for (let requestIndex = 0; requestIndex < 20; requestIndex += 1) {
            const staticResponse = await agent.get('/assets/app.js');
            expect(staticResponse.status).toBe(200);
        }
    });

    it('does not block authenticated users during normal navigation', async () => {
        const app = buildTestApp();
        const agent = request.agent(app);

        await agent.post('/__test/login').send({});

        for (let requestIndex = 0; requestIndex < 350; requestIndex += 1) {
            const response = await agent.get('/dashboard');
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ ok: true });
        }
    });
});
