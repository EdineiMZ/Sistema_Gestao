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

router.post(
    '/goals',
    authMiddleware,
    permissionMiddleware(USER_ROLES.ADMIN),
    audit('financeGoal.save', (req) => {
        const month = req.body?.month || req.body?.goalMonth || 'unknown';
        return `FinanceGoal:save:${month}`;
    }),
    financeController.saveFinanceGoal
);

router.delete(
    '/goals/:id',
    authMiddleware,
    permissionMiddleware(USER_ROLES.ADMIN),
    audit('financeGoal.delete', (req) => `FinanceGoal:${req.params.id}`),
    financeController.deleteFinanceGoal
);

router.get(
    '/export/pdf',
    authMiddleware,
    permissionMiddleware(USER_ROLES.ADMIN),
    audit('financeEntry.exportPdf', (req) => {
        const start = req.query?.startDate || 'all';
        const end = req.query?.endDate || 'all';
        return `FinanceExport:pdf:${start}-${end}`;
    }),
    financeController.exportPdf
);

router.get(
    '/export/excel',
    authMiddleware,
    permissionMiddleware(USER_ROLES.ADMIN),
    audit('financeEntry.exportExcel', (req) => {
        const start = req.query?.startDate || 'all';
        const end = req.query?.endDate || 'all';
        return `FinanceExport:excel:${start}-${end}`;
    }),
    financeController.exportExcel
);


module.exports = router;
