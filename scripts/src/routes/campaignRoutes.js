const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaignController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const { createFilterValidation } = require('../middlewares/queryValidationMiddleware');
const { USER_ROLES } = require('../constants/roles');

const campaignFiltersValidation = createFilterValidation({
    allowedStatuses: ['draft', 'scheduled', 'queued', 'sending', 'sent', 'failed', 'cancelled'],
    redirectTo: '/campaigns'
});

router.get(
    '/',
    authMiddleware,
    permissionMiddleware(USER_ROLES.ADMIN),
    ...campaignFiltersValidation,
    campaignController.listCampaigns
);

router.get('/create', authMiddleware, permissionMiddleware(USER_ROLES.ADMIN), campaignController.showCreate);
router.post('/', authMiddleware, permissionMiddleware(USER_ROLES.ADMIN), campaignController.createCampaign);
router.post('/:id/queue', authMiddleware, permissionMiddleware(USER_ROLES.ADMIN), campaignController.queueCampaign);
router.post('/:id/dispatch', authMiddleware, permissionMiddleware(USER_ROLES.ADMIN), campaignController.dispatchCampaign);
router.post('/dispatch/pending', authMiddleware, permissionMiddleware(USER_ROLES.ADMIN), campaignController.dispatchPending);

module.exports = router;
