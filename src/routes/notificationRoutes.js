// src/routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const { createFilterValidation } = require('../middlewares/queryValidationMiddleware');
const { USER_ROLES } = require('../constants/roles');

const notificationFiltersValidation = createFilterValidation({
    allowedStatuses: ['active', 'inactive'],
    redirectTo: '/notifications'
});

// Apenas administradores podem gerenciar notificações
router.get(
    '/',
    authMiddleware,
    permissionMiddleware(USER_ROLES.ADMIN),
    ...notificationFiltersValidation,
    notificationController.listNotifications
);
router.get('/create', authMiddleware, permissionMiddleware(USER_ROLES.ADMIN), notificationController.showCreate);
router.post('/create', authMiddleware, permissionMiddleware(USER_ROLES.ADMIN), notificationController.createNotification);

router.get('/edit/:id', authMiddleware, permissionMiddleware(USER_ROLES.ADMIN), notificationController.showEdit);
router.put('/update/:id', authMiddleware, permissionMiddleware(USER_ROLES.ADMIN), notificationController.updateNotification);

router.delete('/delete/:id', authMiddleware, permissionMiddleware(USER_ROLES.ADMIN), notificationController.deleteNotification);

module.exports = router;
