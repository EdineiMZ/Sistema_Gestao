const express = require('express');

const supportController = require('../controllers/supportController');
const authMiddleware = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/authorize');
const { uploadSupportAttachments } = require('../middlewares/supportAttachmentUpload');
const { USER_ROLES } = require('../constants/roles');

const router = express.Router();

router.use(authMiddleware);
router.use(authorize([USER_ROLES.CLIENT]));

router.get('/tickets', supportController.listTickets);
router.get('/tickets/new', supportController.showCreateForm);
router.post('/tickets', uploadSupportAttachments, supportController.createTicket);
router.get('/tickets/:id', supportController.viewTicket);

module.exports = router;
