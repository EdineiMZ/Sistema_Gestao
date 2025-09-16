const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { validateRegister } = require('../middlewares/validateMiddleware');
const upload = require('../middlewares/uploadMiddleware'); // multer config

// Página inicial
router.get('/', (req, res) => {
    res.render('index');
});


// Rotas de login
router.get('/login', authController.showLogin);
router.post('/login', authController.login);

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

// Rota de logout
router.get('/logout', authController.logout);

module.exports = router;
