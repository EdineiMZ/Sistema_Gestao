const express = require('express');
const multer = require('multer');

const supportController = require('../controllers/supportController');
const authMiddleware = require('../middlewares/authMiddleware');
const { constants: chatConstants } = require('../services/supportChatService');

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: chatConstants.MAX_FILE_SIZE
    }
});

router.get('/tickets/:ticketId/chat', authMiddleware, supportController.renderChat);
router.get('/tickets/:ticketId/history', authMiddleware, supportController.fetchHistory);
router.post(
    '/tickets/:ticketId/attachments',
    authMiddleware,
    upload.single('file'),
    supportController.uploadAttachment
);
router.post(
    '/tickets/:ticketId/notify-admin-entry',
    authMiddleware,
    supportController.notifyAdminEntry
);
router.get(
    '/attachments/:attachmentId/download',
    authMiddleware,
    supportController.downloadAttachment
);

module.exports = router;
