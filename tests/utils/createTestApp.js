const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');

const authRoutes = require('../../src/routes/authRoutes');

const createTestApp = () => {
    const app = express();

    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());

    app.use(session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false
    }));

    app.use(flash());

    app.use((req, res, next) => {
        res.locals = res.locals || {};
        next();
    });

    app.use('/', authRoutes);

    app.get('/__test/flash', (req, res) => {
        res.json({
            error: req.flash('error_msg'),
            success: req.flash('success_msg')
        });
    });

    return app;
};

module.exports = { createTestApp };

