const express = require('express');
const router = express.Router();

const auditController = require('../controllers/auditController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const { USER_ROLES } = require('../constants/roles');

router.get(
    '/logs',
    authMiddleware,
    permissionMiddleware(USER_ROLES.ADMIN),
    auditController.listLogs
);

module.exports = router;
