'use strict';
const {
    SupportTicket,
    SupportMessage,
    SupportAttachment,
    User
} = require('../../database/models');
const {
    isSupportAgentRole,
    TICKET_STATUSES
} = require('../constants/support');
const {
    createTicket,
    addMessage,
    updateTicketStatus,
    assignTicket,
    normalizeAttachmentsInput
} = require('../services/supportTicketService');

const wantsJson = (req) => {
    const accept = req.headers.accept || '';
    return req.xhr || accept.includes('application/json') || accept.includes('text/json');
};

const parseAttachments = (raw) => {
    if (!raw) {
        return [];
    }

    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return normalizeAttachmentsInput(parsed);
        } catch (error) {
            return [];
        }
    }

    return normalizeAttachmentsInput(raw);
};

const handleSuccess = (req, res, message, payload = {}) => {
    if (wantsJson(req)) {
        return res.json({ message, ...payload });
    }

    if (message) {
        req.flash('success_msg', message);
    }

    return res.redirect('/support/tickets');
};

const handleError = (req, res, error) => {
    const message = error && error.message ? error.message : 'Não foi possível concluir a operação.';

    if (wantsJson(req)) {
        return res.status(400).json({ message });
    }

    req.flash('error_msg', message);
    return res.redirect('/support/tickets');
};

const listTickets = async (req, res) => {
    try {
        const user = req.user;
        const agent = isSupportAgentRole(user?.role);

        const where = agent
            ? {}
            : { creatorId: user.id };

        const records = await SupportTicket.findAll({
            where,
            include: [
                {
                    model: User,
                    as: 'creator',
                    attributes: ['id', 'name', 'email', 'role']
                },
                {
                    model: User,
                    as: 'assignee',
                    attributes: ['id', 'name', 'email', 'role']
                },
                {
                    model: SupportMessage,
                    as: 'messages',
                    include: [
                        {
                            model: User,
                            as: 'sender',
                            attributes: ['id', 'name', 'role']
                        },
                        {
                            model: SupportAttachment,
                            as: 'attachments',
                            attributes: ['id', 'fileName', 'storageKey', 'contentType', 'fileSize', 'createdAt']
                        }
                    ]
                }
            ],
            order: [['updatedAt', 'DESC']]
        });

        const tickets = records.map((ticket) => {
            const plain = ticket.get({ plain: true });
            if (Array.isArray(plain.messages)) {
                plain.messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            }
            return plain;
        });

        if (wantsJson(req)) {
            return res.json({ tickets, isAgent: agent });
        }

        return res.render('support/tickets', {
            tickets,
            isAgent: agent,
            statuses: TICKET_STATUSES
        });
    } catch (error) {
        return handleError(req, res, error);
    }
};

const createTicketController = async (req, res) => {
    try {
        const assignedToId = req.body.assignedToId ? Number.parseInt(req.body.assignedToId, 10) : null;

        await createTicket({
            subject: req.body.subject,
            description: req.body.description,
            creator: req.user,
            attachments: parseAttachments(req.body.attachments),
            assignedToId: Number.isFinite(assignedToId) ? assignedToId : null,
            ipAddress: req.ip
        });

        return handleSuccess(req, res, 'Chamado criado com sucesso.');
    } catch (error) {
        return handleError(req, res, error);
    }
};

const addMessageController = async (req, res) => {
    try {
        const ticketId = Number.parseInt(req.params.ticketId, 10);

        if (!Number.isFinite(ticketId)) {
            throw new Error('Chamado inválido.');
        }

        await addMessage({
            ticketId,
            sender: req.user,
            body: req.body.body,
            attachments: parseAttachments(req.body.attachments),
            ipAddress: req.ip
        });

        return handleSuccess(req, res, 'Mensagem registrada com sucesso.');
    } catch (error) {
        return handleError(req, res, error);
    }
};

const updateStatusController = async (req, res) => {
    try {
        const ticketId = Number.parseInt(req.params.ticketId, 10);

        if (!Number.isFinite(ticketId)) {
            throw new Error('Chamado inválido.');
        }

        await updateTicketStatus({
            ticketId,
            status: req.body.status,
            actor: req.user,
            ipAddress: req.ip
        });

        return handleSuccess(req, res, 'Status atualizado com sucesso.');
    } catch (error) {
        return handleError(req, res, error);
    }
};

const assignTicketController = async (req, res) => {
    try {
        const ticketId = Number.parseInt(req.params.ticketId, 10);

        if (!Number.isFinite(ticketId)) {
            throw new Error('Chamado inválido.');
        }

        const assignedToId = req.body.assignedToId ? Number.parseInt(req.body.assignedToId, 10) : null;

        await assignTicket({
            ticketId,
            assignedToId: Number.isFinite(assignedToId) ? assignedToId : null,
            actor: req.user,
            ipAddress: req.ip
        });

        return handleSuccess(req, res, 'Chamado atribuído com sucesso.');
    } catch (error) {
        return handleError(req, res, error);
    }
};

module.exports = {
    listTickets,
    createTicket: createTicketController,
    addMessage: addMessageController,
    updateStatus: updateStatusController,
    assignTicket: assignTicketController
};