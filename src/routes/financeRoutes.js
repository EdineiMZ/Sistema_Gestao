const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');

// Geralmente admin ou financeiro teria role >= 3 ou 4
router.get('/', authMiddleware, permissionMiddleware(4), financeController.listFinanceEntries);
router.post('/create', authMiddleware, permissionMiddleware(4), financeController.createFinanceEntry);
router.put('/update/:id', authMiddleware, permissionMiddleware(4), financeController.updateFinanceEntry);
router.delete('/delete/:id', authMiddleware, permissionMiddleware(4), financeController.deleteFinanceEntry);

module.exports = router;
