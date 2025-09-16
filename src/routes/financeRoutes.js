const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const audit = require('../middlewares/audit');
const { USER_ROLES } = require('../constants/roles');

// Apenas administradores podem gerenciar finanças
router.get('/', authMiddleware, permissionMiddleware(USER_ROLES.ADMIN), financeController.listFinanceEntries);
router.post(
    '/create',
    authMiddleware,
    permissionMiddleware(USER_ROLES.ADMIN),
    audit('financeEntry.create', (req) => `FinanceEntry:${req.body?.description || 'novo'}`),
    financeController.createFinanceEntry
);
router.put(
    '/update/:id',
    authMiddleware,
    permissionMiddleware(USER_ROLES.ADMIN),
    audit('financeEntry.update', (req) => `FinanceEntry:${req.params.id}`),
    financeController.updateFinanceEntry
);
router.delete(
    '/delete/:id',
    authMiddleware,
    permissionMiddleware(USER_ROLES.ADMIN),
    audit('financeEntry.delete', (req) => `FinanceEntry:${req.params.id}`),
    financeController.deleteFinanceEntry
);


module.exports = router;
