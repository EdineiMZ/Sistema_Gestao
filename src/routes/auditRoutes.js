const express = require('express');
const router = express.Router();

const auditController = require('../controllers/auditController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');

router.get(
    '/logs',
    authMiddleware,
    permissionMiddleware(4),
    auditController.listLogs
);

module.exports = router;
