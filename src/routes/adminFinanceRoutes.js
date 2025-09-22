const express = require('express');
const adminFinanceController = require('../controllers/adminFinanceController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const audit = require('../middlewares/audit');
const { USER_ROLES } = require('../constants/roles');

const router = express.Router();

// Garante que respostas JSON sejam tratadas como requisições AJAX pelos middlewares legados
router.use((req, res, next) => {
    if (!req.xhr && typeof req.get === 'function') {
        const accepts = req.get('accept') || req.headers.accept;
        if (typeof accepts === 'string' && accepts.includes('application/json')) {
            req.xhr = true; // compatibilidade com permissionMiddleware para resposta JSON
        }
    }
    next();
});

router.use(authMiddleware);
router.use(permissionMiddleware(USER_ROLES.ADMIN));

router.get('/access-policy', adminFinanceController.renderFinanceAccessPolicy);
router.post(
    '/access-policy',
    audit('finance.accessPolicy.update', () => 'FinanceAccessPolicy'),
    adminFinanceController.updateFinanceAccessPolicy
);

router.get('/budgets', adminFinanceController.listBudgets);
router.post('/budgets', adminFinanceController.createBudget);
router.put('/budgets/:id', adminFinanceController.updateBudget);
router.delete('/budgets/:id', adminFinanceController.deleteBudget);

router.get('/categories', adminFinanceController.listCategories);
router.post('/categories', adminFinanceController.createCategory);
router.put('/categories/:id', adminFinanceController.updateCategory);
router.delete('/categories/:id', adminFinanceController.deleteCategory);

module.exports = router;

