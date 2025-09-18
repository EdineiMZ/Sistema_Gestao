// src/middlewares/authMiddleware.js
module.exports = (req, res, next) => {
    if (req.user && req.user.active) {
        return next();
    }

    if (req.session.user && req.session.user.active) {
        req.user = req.session.user;
        return next();
    }

    req.flash('error_msg', 'Você precisa estar logado para acessar esta página.');
    return res.redirect('/login');
};
