const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { validateRegister } = require('../middlewares/validateMiddleware');
const upload = require('../middlewares/uploadMiddleware'); // multer config
const { loginRateLimiter } = require('../middlewares/rateLimiters');
const {
    featuredProducts,
    promotionProducts,
    recommendedProducts,
    catalogProducts
} = require('../constants/homepageProducts');

// Página inicial
router.get('/', (req, res) => {
    res.render('index', {
        pageTitle: 'Kabum Experience',
        featuredProducts,
        promotionProducts,
        recommendedProducts,
        catalogProducts
    });
});


// Rotas de login
router.get('/login', authController.showLogin);
router.post('/login', loginRateLimiter, authController.login);
router.post('/login/verify-2fa', loginRateLimiter, authController.verifyTwoFactor);

// Rotas de registro (cadastro de usuário) com validação
// Rota GET /register (renderiza form)
router.get('/register', authController.showRegister);

// Rota POST /register
router.post(
    '/register',
    upload.single('profileImage'), // parseia multipart/form-data
    validateRegister,              // valida nome, email, senha
    authController.register        // se passou, cria usuário
);

router.get('/verify-email', authController.verifyEmail);

// Rota de logout
router.get('/logout', authController.logout);

module.exports = router;
