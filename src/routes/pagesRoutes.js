const express = require('express');
const router = express.Router();
const pagesController = require('../controllers/pagesController');
const authMiddleware = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/authorize');

router.get('/sobre', authMiddleware, authorize(), pagesController.showSobre);
router.get('/contact', authMiddleware, authorize(), pagesController.showContact);
router.get('/agendamentos', authMiddleware, authorize(), pagesController.showAgendamentos);
router.get('/terms', authMiddleware, authorize(), pagesController.showTerms);

module.exports = router;
