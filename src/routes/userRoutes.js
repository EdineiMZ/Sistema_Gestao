// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();

const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const upload = require('../middlewares/uploadMiddleware');
const audit = require('../middlewares/audit');
const { createFilterValidation } = require('../middlewares/queryValidationMiddleware');


const manageUsersValidation = createFilterValidation({
    allowedStatuses: ['active', 'inactive'],
    redirectTo: '/users/manage'
});

// Todas as rotas de gerenciamento de usuários requerem login e permissão >= 4
router.get(
    '/manage',
    authMiddleware,
    permissionMiddleware(4),
    ...manageUsersValidation,
    userController.manageUsers
);


// Upload da imagem no create e update
router.post(
    '/create',
    authMiddleware,
    permissionMiddleware(4),
    upload.single('profileImage'),
    audit('user.create', (req) => `User:${req.body?.email || 'novo'}`),
    userController.createUser
);

router.put(
    '/update/:id',
    authMiddleware,
    permissionMiddleware(4),
    upload.single('profileImage'),
    audit('user.update', (req) => `User:${req.params.id}`),
    userController.updateUser
);

router.delete(
    '/delete/:id',
    authMiddleware,
    permissionMiddleware(4),
    audit('user.delete', (req) => `User:${req.params.id}`),
    userController.deleteUser
);

module.exports = router;
