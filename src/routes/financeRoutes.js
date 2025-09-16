const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const authMiddleware = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/authorize');

// Acesso restrito a administradores
router.get('/', authMiddleware, authorize('admin'), financeController.listFinanceEntries);
router.post('/create', authMiddleware, authorize('admin'), financeController.createFinanceEntry);
router.put('/update/:id', authMiddleware, authorize('admin'), financeController.updateFinanceEntry);
router.delete('/delete/:id', authMiddleware, authorize('admin'), financeController.deleteFinanceEntry);

module.exports = router;
