// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();

const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const upload = require('../middlewares/uploadMiddleware');
const audit = require('../middlewares/audit');
const { createFilterValidation } = require('../middlewares/queryValidationMiddleware');
const { USER_ROLES } = require('../constants/roles');


const manageUsersValidation = createFilterValidation({
    allowedStatuses: ['active', 'inactive'],
    redirectTo: '/users/manage'
});

router.get(
    '/profile',
    authMiddleware,
    userController.showProfile
);

router.post(
    '/profile',
    authMiddleware,
    audit('user.profile.update', (req) => `User:${req.user?.id || 'unknown'}`),
    userController.updateProfile
);

// Todas as rotas de gerenciamento de usuários requerem login e perfil de administrador
router.get(
    '/manage',
    authMiddleware,
    permissionMiddleware(USER_ROLES.ADMIN),
    ...manageUsersValidation,
    userController.manageUsers
);

router.get(
    '/preferences',
    authMiddleware,
    userController.showPreferences
);

router.post(
    '/preferences',
    authMiddleware,
    audit('user.preferences.update', (req) => `User:${req.user?.id || 'unknown'}`),
    userController.updatePreferences
);


// Upload da imagem no create e update
router.post(
    '/create',
    authMiddleware,
    permissionMiddleware(USER_ROLES.ADMIN),
    upload.single('profileImage'),
    audit('user.create', (req) => `User:${req.body?.email || 'novo'}`),
    userController.createUser
);

router.put(
    '/update/:id',
    authMiddleware,
    permissionMiddleware(USER_ROLES.ADMIN),
    upload.single('profileImage'),
    audit('user.update', (req) => `User:${req.params.id}`),
    userController.updateUser
);

router.delete(
    '/delete/:id',
    authMiddleware,
    permissionMiddleware(USER_ROLES.ADMIN),
    audit('user.delete', (req) => `User:${req.params.id}`),
    userController.deleteUser
);

module.exports = router;
