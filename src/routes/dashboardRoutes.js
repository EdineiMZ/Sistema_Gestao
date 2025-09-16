const express = require('express');
const router = express.Router();

const dashboardController = require('../controllers/dashboardController');
const authMiddleware = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/authorize');

router.get('/', authMiddleware, authorize(['Admin', 'Manager']), dashboardController.renderDashboard);
router.get('/data', authMiddleware, authorize(['Admin', 'Manager']), dashboardController.fetchDashboardData);

module.exports = router;
