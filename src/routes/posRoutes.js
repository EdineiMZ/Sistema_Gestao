const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/authorize');
const { USER_ROLES } = require('../constants/roles');
const posController = require('../controllers/posController');
const {
    openSaleValidation,
    addItemValidation,
    addPaymentValidation,
    finalizeSaleValidation,
    productSearchValidation
} = require('../middlewares/posValidationMiddleware');

const router = express.Router();

router.use(authMiddleware);
router.use(authorize([USER_ROLES.MANAGER, USER_ROLES.SPECIALIST]));

router.get('/', posController.renderPosPage);
router.get('/products', productSearchValidation, posController.listProducts);
router.post('/sales', openSaleValidation, posController.openSale);
router.get('/sales/:saleId', finalizeSaleValidation, posController.getSale);
router.post('/sales/:saleId/items', addItemValidation, posController.addItem);
router.post('/sales/:saleId/payments', addPaymentValidation, posController.addPayment);
router.post('/sales/:saleId/finalize', finalizeSaleValidation, posController.finalizeSale);
router.get('/sales/:saleId/receipt', finalizeSaleValidation, posController.downloadReceipt);
router.get('/reports', posController.getPosReports);
router.get('/reports/top-products', posController.getTopProductsReport);
router.get('/reports/traffic', posController.getTrafficReport);
router.get('/reports/inventory', posController.getInventoryReport);

module.exports = router;
