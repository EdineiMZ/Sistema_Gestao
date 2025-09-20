const { TICKET_STATUSES, isSupportAgentRole } = require('../constants/support');
const { USER_ROLES, ROLE_LABELS, roleAtLeast } = require('../constants/roles');
const supportTicketService = require('../services/supportTicketService');

const getRequestUser = (req) => {
    if (req.user && req.user.active) {
        return req.user;
    }

    if (req.session && req.session.user && req.session.user.active) {
        return req.session.user;
    }

    return null;
};

const pullFlashMessage = (req, type) => {
    if (typeof req.flash !== 'function') {
        return null;
    }

    const messages = req.flash(type);
    if (!Array.isArray(messages) || messages.length === 0) {
        return null;
    }

    return messages[0];
};

const pushFlashMessage = (req, type, message) => {
    if (typeof req.flash === 'function') {
        req.flash(type, message);
    }
};

const TICKET_STATUS_LABELS = Object.freeze({
    [TICKET_STATUSES.PENDING]: 'Pendente',
    [TICKET_STATUSES.IN_PROGRESS]: 'Em andamento',
    [TICKET_STATUSES.RESOLVED]: 'Resolvido'
});

const TICKET_PRIORITY_LABELS = Object.freeze({
    low: 'Baixa',
    medium: 'Média',
    high: 'Alta'
});

const ALLOWED_TICKET_PRIORITIES = Object.freeze(['low', 'medium', 'high']);
const DEFAULT_TICKET_PRIORITY = 'medium';
const DEFAULT_DATETIME_LABEL = '--';

const createDateTimeFormatter = () => {
    try {
        return new Intl.DateTimeFormat('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short'
        });
    } catch (error) {
        return null;
    }
};

const dateTimeFormatter = createDateTimeFormatter();

const formatDateTime = (value) => {
    if (!value) {
        return DEFAULT_DATETIME_LABEL;
    }

    try {
        const parsedDate = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(parsedDate.getTime())) {
            return DEFAULT_DATETIME_LABEL;
        }

        if (dateTimeFormatter) {
            return dateTimeFormatter.format(parsedDate);
        }

        return parsedDate.toLocaleString('pt-BR');
    } catch (error) {
        return DEFAULT_DATETIME_LABEL;
    }
};

const summarizeTicketForList = (ticket) => {
    if (!ticket) {
        return null;
    }

    const normalizedPriority = typeof ticket.priority === 'string'
        ? ticket.priority.trim().toLowerCase()
        : null;

    const priority = ALLOWED_TICKET_PRIORITIES.includes(normalizedPriority)
        ? normalizedPriority
        : DEFAULT_TICKET_PRIORITY;

    const attachmentCount = Array.isArray(ticket.messages)
        ? ticket.messages.reduce((total, message) => {
            if (!message) {
                return total;
            }

            const attachments = Array.isArray(message.attachments)
                ? message.attachments.length
                : 0;

            return total + attachments;
        }, 0)
        : 0;

    const creator = ticket.creator
        ? {
            id: ticket.creator.id,
            name: ticket.creator.name,
            email: ticket.creator.email || null
        }
        : null;

    const requester = ticket.requester
        ? {
            id: ticket.requester.id,
            name: ticket.requester.name,
            email: ticket.requester.email || null
        }
        : null;

    return {
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        statusLabel: TICKET_STATUS_LABELS[ticket.status] || ticket.status,
        priority,
        priorityLabel: TICKET_PRIORITY_LABELS[priority] || priority,
        createdAtFormatted: formatDateTime(ticket.createdAt),
        updatedAtFormatted: formatDateTime(ticket.updatedAt || ticket.lastMessageAt || ticket.createdAt),
        attachmentCount,
        creator,
        requester
    };
};

const supportTicketController = {
    async listTickets(req, res) {
        try {
            const user = getRequestUser(req);
            if (!user) {
                pushFlashMessage(req, 'error_msg', 'Você precisa estar logado para acessar esta página.');
                return res.redirect('/login');
            }

            const tickets = await supportTicketService.listTicketsForUser({ user });

            const ticketSummaries = Array.isArray(tickets)
                ? tickets.map(summarizeTicketForList).filter(Boolean)
                : [];

            res.render('support/listTickets', {
                tickets: ticketSummaries,
                isAgent: isSupportAgentRole(user.role),
                isAdmin: roleAtLeast(user.role, USER_ROLES.ADMIN),
                user,
                appName: req.app?.locals?.appName || 'Sistema de Gestão',
                roleLabels: ROLE_LABELS,
                notifications: [],
                success_msg: pullFlashMessage(req, 'success_msg'),
                error_msg: pullFlashMessage(req, 'error_msg'),
                pageTitle: 'Central de suporte'
            });
        } catch (error) {
            console.error('Erro ao listar chamados de suporte:', error);
            pushFlashMessage(req, 'error_msg', error?.message || 'Não foi possível carregar seus chamados.');
            return res.redirect('/');
        }
    },

    async createTicket(req, res) {
        try {
            const user = getRequestUser(req);
            if (!user) {
                pushFlashMessage(req, 'error_msg', 'Você precisa estar logado para criar um chamado.');
                return res.redirect('/login');
            }

            const { subject, description } = req.body || {};

            await supportTicketService.createTicket({
                subject,
                description,
                creator: user,
                attachments: [],
                ipAddress: req.ip
            });

            pushFlashMessage(req, 'success_msg', 'Chamado criado com sucesso. Nossa equipe já foi notificada!');
            return res.redirect('/support/tickets');
        } catch (error) {
            console.error('Erro ao criar chamado de suporte:', error);
            pushFlashMessage(req, 'error_msg', error?.message || 'Não foi possível criar o chamado.');
            return res.redirect('/support/tickets');
        }
    },

    async addMessage(req, res) {
        try {
            const user = getRequestUser(req);
            if (!user) {
                pushFlashMessage(req, 'error_msg', 'Você precisa estar logado para atualizar o chamado.');
                return res.redirect('/login');
            }

            const ticketId = Number.parseInt(req.params.ticketId, 10);
            const { body } = req.body || {};

            await supportTicketService.addMessage({
                ticketId,
                sender: user,
                body,
                attachments: [],
                ipAddress: req.ip
            });

            pushFlashMessage(req, 'success_msg', 'Mensagem enviada com sucesso.');
            return res.redirect('/support/tickets');
        } catch (error) {
            console.error('Erro ao adicionar mensagem no chamado de suporte:', error);
            pushFlashMessage(req, 'error_msg', error?.message || 'Não foi possível enviar a mensagem.');
            return res.redirect('/support/tickets');
        }
    },

    async updateStatus(req, res) {
        try {
            const user = getRequestUser(req);
            if (!user) {
                pushFlashMessage(req, 'error_msg', 'Você precisa estar logado para atualizar o status.');
                return res.redirect('/login');
            }

            const ticketId = Number.parseInt(req.params.ticketId, 10);
            const { status } = req.body || {};

            await supportTicketService.updateTicketStatus({
                ticketId,
                status,
                actor: user,
                ipAddress: req.ip
            });

            pushFlashMessage(req, 'success_msg', 'Status do chamado atualizado.');
            return res.redirect('/support/tickets');
        } catch (error) {
            console.error('Erro ao atualizar status do chamado de suporte:', error);
            pushFlashMessage(req, 'error_msg', error?.message || 'Não foi possível atualizar o status do chamado.');
            return res.redirect('/support/tickets');
        }
    }
};

module.exports = supportTicketController;
