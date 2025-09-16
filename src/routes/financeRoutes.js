const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const audit = require('../middlewares/audit');

// Geralmente admin ou financeiro teria role >= 3 ou 4
router.get('/', authMiddleware, permissionMiddleware(4), financeController.listFinanceEntries);
router.post(
    '/create',
    authMiddleware,
    permissionMiddleware(4),
    audit('financeEntry.create', (req) => `FinanceEntry:${req.body?.description || 'novo'}`),
    financeController.createFinanceEntry
);
router.put(
    '/update/:id',
    authMiddleware,
    permissionMiddleware(4),
    audit('financeEntry.update', (req) => `FinanceEntry:${req.params.id}`),
    financeController.updateFinanceEntry
);
router.delete(
    '/delete/:id',
    authMiddleware,
    permissionMiddleware(4),
    audit('financeEntry.delete', (req) => `FinanceEntry:${req.params.id}`),
    financeController.deleteFinanceEntry
);

module.exports = router;
