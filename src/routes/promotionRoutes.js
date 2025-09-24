const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/authorize');
const { USER_ROLES } = require('../constants/roles');
const promotionController = require('../controllers/promotionController');

const router = express.Router();

router.use(authMiddleware);
router.use(authorize([USER_ROLES.MANAGER, USER_ROLES.ADMIN]));

router.get('/', promotionController.listPromotions);
router.get('/new', promotionController.renderCreateForm);
router.post('/', promotionController.createPromotion);
router.get('/:id/edit', promotionController.renderEditForm);
router.put('/:id', promotionController.updatePromotion);
router.delete('/:id', promotionController.deletePromotion);

module.exports = router;
