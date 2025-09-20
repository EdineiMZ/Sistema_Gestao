const express = require('express');
const multer = require('multer');

const supportController = require('../controllers/supportController');
const supportTicketController = require('../controllers/supportTicketController');
const authMiddleware = require('../middlewares/authMiddleware');
const { constants: chatConstants } = require('../services/supportChatService');

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: chatConstants.MAX_FILE_SIZE
    }
});

router.get('/tickets', authMiddleware, supportTicketController.listTickets);
router.post('/tickets', authMiddleware, supportTicketController.createTicket);
router.post('/tickets/:ticketId/messages', authMiddleware, supportTicketController.addMessage);
router.post('/tickets/:ticketId/status', authMiddleware, supportTicketController.updateStatus);
router.get('/tickets/:ticketId', authMiddleware, supportTicketController.showTicket);
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
