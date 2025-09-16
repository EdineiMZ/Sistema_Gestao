const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaignController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const { createFilterValidation } = require('../middlewares/queryValidationMiddleware');

const campaignFiltersValidation = createFilterValidation({
    allowedStatuses: ['draft', 'scheduled', 'queued', 'sending', 'sent', 'failed', 'cancelled'],
    redirectTo: '/campaigns'
});

router.get(
    '/',
    authMiddleware,
    permissionMiddleware(4),
    ...campaignFiltersValidation,
    campaignController.listCampaigns
);

router.get('/create', authMiddleware, permissionMiddleware(4), campaignController.showCreate);
router.post('/', authMiddleware, permissionMiddleware(4), campaignController.createCampaign);
router.post('/:id/queue', authMiddleware, permissionMiddleware(4), campaignController.queueCampaign);
router.post('/:id/dispatch', authMiddleware, permissionMiddleware(4), campaignController.dispatchCampaign);
router.post('/dispatch/pending', authMiddleware, permissionMiddleware(4), campaignController.dispatchPending);

module.exports = router;
