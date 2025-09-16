const express = require('express');
const router = express.Router();
const pagesController = require('../controllers/pagesController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');

router.get('/sobre', authMiddleware, permissionMiddleware(0), pagesController.showSobre);
router.get('/contact', authMiddleware, permissionMiddleware(0), pagesController.showContact);
router.get('/agendamentos', authMiddleware, permissionMiddleware(0), pagesController.showAgendamentos);

module.exports = router;
