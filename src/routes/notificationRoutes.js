// src/routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/authorize');

// Supondo que apenas administradores possam gerenciar notificações
router.get('/', authMiddleware, authorize('admin'), notificationController.listNotifications);
router.get('/create', authMiddleware, authorize('admin'), notificationController.showCreate);
router.post('/create', authMiddleware, authorize('admin'), notificationController.createNotification);

router.get('/edit/:id', authMiddleware, authorize('admin'), notificationController.showEdit);
router.put('/update/:id', authMiddleware, authorize('admin'), notificationController.updateNotification);

router.delete('/delete/:id', authMiddleware, authorize('admin'), notificationController.deleteNotification);

module.exports = router;
