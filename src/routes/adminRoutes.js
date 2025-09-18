const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const authMiddleware = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/authorize');
const { USER_ROLES } = require('../constants/roles');

router.get('/', authMiddleware, authorize(USER_ROLES.ADMIN), adminController.showPortal);

module.exports = router;
