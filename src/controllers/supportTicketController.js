const { TICKET_STATUSES, isSupportAgentRole } = require('../constants/support');
const { ROLE_LABELS, USER_ROLES, roleAtLeast } = require('../constants/roles');
const supportTicketService = require('../services/supportTicketService');

const STATUS_LABELS = Object.freeze({
    [TICKET_STATUSES.PENDING]: 'Pendente',
    [TICKET_STATUSES.IN_PROGRESS]: 'Em andamento',
    [TICKET_STATUSES.RESOLVED]: 'Resolvido'
});

const PRIORITY_LABELS = Object.freeze({
    low: 'Baixa',
    medium: 'Média',
    high: 'Alta'
});

const formatFileSize = (sizeInBytes) => {
    const size = Number(sizeInBytes);
    if (!Number.isFinite(size) || size <= 0) {
        return '—';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.min(
        Math.floor(Math.log(size) / Math.log(1024)),
        units.length - 1
    );
    const normalizedSize = size / (1024 ** exponent);

    return `${normalizedSize.toFixed(normalizedSize >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

const buildTicketDetailViewModel = (ticket) => {
    if (!ticket) {
        return null;
    }

    const normalizedPriority = ticket.priority || 'medium';
    const attachments = Array.isArray(ticket.attachments)
        ? ticket.attachments.map((attachment) => ({
            ...attachment,
            mimeType: attachment.contentType || 'Arquivo',
            sizeFormatted: formatFileSize(attachment.fileSize),
            createdAtFormatted: formatDateTime(attachment.createdAt),
            downloadUrl: attachment.id ? `/support/attachments/${attachment.id}/download` : null
        }))
        : [];

    const initialMessage = Array.isArray(ticket.messages) && ticket.messages.length
        ? ticket.messages[0].body
        : '';

    return {
        ...ticket,
        attachments,
        attachmentCount: attachments.length,
        createdAtFormatted: formatDateTime(ticket.createdAt),
        updatedAtFormatted: formatDateTime(ticket.updatedAt),
        statusLabel: STATUS_LABELS[ticket.status] || '—',
        priority: normalizedPriority,
        priorityLabel: PRIORITY_LABELS[normalizedPriority] || 'Padrão',
        initialMessage
    };
};

const buildMessageTimeline = (messages = []) => {
    return messages.map((message) => ({
        ...message,
        createdAtFormatted: formatDateTime(message.createdAt),
        senderDisplay: message.sender?.name || 'Usuário',
        senderRoleLabel: message.sender?.role ? ROLE_LABELS[message.sender.role] || 'Usuário' : null,
        attachments: Array.isArray(message.attachments)
            ? message.attachments.map((attachment) => ({
                ...attachment,
                mimeType: attachment.contentType || 'Arquivo',
                sizeFormatted: formatFileSize(attachment.fileSize),
                downloadUrl: attachment.id ? `/support/attachments/${attachment.id}/download` : null
            }))
            : []
    }));
};

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
            const isAgent = isSupportAgentRole(user.role);
            const isAdmin = roleAtLeast(user.role, USER_ROLES.ADMIN);

            res.render('support/tickets', {
                tickets,
                statuses: TICKET_STATUSES,
                isAgent,
                isAdmin,
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
    },

    async showTicket(req, res) {
        try {
            const user = getRequestUser(req);
            if (!user) {
                pushFlashMessage(req, 'error_msg', 'Você precisa estar logado para visualizar o chamado.');
                return res.redirect('/login');
            }

            const ticket = await supportTicketService.getTicketById({
                ticketId: req.params.ticketId
            });

            const isAgent = isSupportAgentRole(user.role);
            const isCreator = ticket.creatorId === user.id;
            const isAssignee = ticket.assignedToId && ticket.assignedToId === user.id;

            if (!isAgent && !isCreator && !isAssignee) {
                pushFlashMessage(req, 'error_msg', 'Você não possui permissão para visualizar este chamado.');
                return res.redirect('/support/tickets');
            }

            const ticketView = buildTicketDetailViewModel(ticket);
            const timeline = buildMessageTimeline(ticket.messages);

            res.render('support/ticketDetail', {
                ticket: ticketView,
                messages: timeline,
                isAgent,
                user,
                chatUrl: `/support/tickets/${ticket.id}/chat`,
                roleLabels: ROLE_LABELS,
                notifications: [],
                success_msg: pullFlashMessage(req, 'success_msg'),
                error_msg: pullFlashMessage(req, 'error_msg'),
                pageTitle: `Chamado #${ticket.id}`,
                appName: req.app?.locals?.appName || 'Sistema de Gestão'
            });
        } catch (error) {
            console.error('Erro ao exibir detalhes do chamado de suporte:', error);
            pushFlashMessage(req, 'error_msg', error?.message || 'Não foi possível carregar os detalhes do chamado.');
            return res.redirect('/support/tickets');
        }
    }
};

module.exports = supportTicketController;
