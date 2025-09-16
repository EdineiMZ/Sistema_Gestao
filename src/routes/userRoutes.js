// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();

const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/authorize');
const upload = require('../middlewares/uploadMiddleware');

// Todas as rotas de gerenciamento de usuários requerem login e permissão >= 4
router.get('/manage', authMiddleware, authorize('admin'), userController.manageUsers);

// Upload da imagem no create e update
router.post(
    '/create',
    authMiddleware,
    authorize('admin'),
    upload.single('profileImage'),
    userController.createUser
);

router.put(
    '/update/:id',
    authMiddleware,
    authorize('admin'),
    upload.single('profileImage'),
    userController.updateUser
);

router.delete(
    '/delete/:id',
    authMiddleware,
    authorize('admin'),
    userController.deleteUser
);

module.exports = router;
