const express = require('express');

const productController = require('../controllers/productController');
const authMiddleware = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/authorize');
const { USER_ROLES } = require('../constants/roles');

const router = express.Router();

router.use(authMiddleware);
router.use(authorize(USER_ROLES.MANAGER));

router.get('/', productController.listProducts);
router.get('/new', productController.renderCreateForm);
router.post('/', productController.createValidations, productController.createProduct);
router.get('/:id', productController.showProductDetail);
router.get('/:id/edit', productController.renderEditForm);
router.put('/:id', productController.updateValidations, productController.updateProduct);
router.delete('/:id', productController.deleteProduct);

module.exports = router;
