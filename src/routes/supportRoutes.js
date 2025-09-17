'use strict';

const express = require('express');
const router = express.Router();

const supportController = require('../controllers/supportController');
const authMiddleware = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/authorize');
const audit = require('../middlewares/audit');
const { USER_ROLES } = require('../constants/roles');

const SUPPORT_AGENT_ROLES = [
    USER_ROLES.COLLABORATOR,
    USER_ROLES.SPECIALIST,
    USER_ROLES.MANAGER,
    USER_ROLES.ADMIN
];

router.get(
    '/tickets',
    authMiddleware,
    supportController.listTickets
);

router.post(
    '/tickets',
    authMiddleware,
    audit('support.ticket.create', (req) => `support_ticket:create:user:${req.user?.id ?? 'unknown'}`),
    supportController.createTicket
);

router.post(
    '/tickets/:ticketId/messages',
    authMiddleware,
    audit('support.ticket.message', (req) => `support_ticket:${req.params.ticketId}:message`),
    supportController.addMessage
);

router.post(
    '/tickets/:ticketId/status',
    authMiddleware,
    audit('support.ticket.status', (req) => `support_ticket:${req.params.ticketId}:status`),
    supportController.updateStatus
);

router.post(
    '/tickets/:ticketId/assign',
    authMiddleware,
    authorize(SUPPORT_AGENT_ROLES),
    audit('support.ticket.assign', (req) => `support_ticket:${req.params.ticketId}:assign`),
    supportController.assignTicket
);

module.exports = router;
