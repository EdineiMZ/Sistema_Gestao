// src/routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const { createFilterValidation } = require('../middlewares/queryValidationMiddleware');

const notificationFiltersValidation = createFilterValidation({
    allowedStatuses: ['active', 'inactive'],
    redirectTo: '/notifications'
});

// Supondo que apenas admin (role >= 4) possa gerenciar notificações
router.get(
    '/',
    authMiddleware,
    permissionMiddleware(4),
    ...notificationFiltersValidation,
    notificationController.listNotifications
);
router.get('/create', authMiddleware, permissionMiddleware(4), notificationController.showCreate);
router.post('/create', authMiddleware, permissionMiddleware(4), notificationController.createNotification);

router.get('/edit/:id', authMiddleware, permissionMiddleware(4), notificationController.showEdit);
router.put('/update/:id', authMiddleware, permissionMiddleware(4), notificationController.updateNotification);

router.delete('/delete/:id', authMiddleware, permissionMiddleware(4), notificationController.deleteNotification);

module.exports = router;
