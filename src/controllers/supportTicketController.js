const { TICKET_STATUSES, isSupportAgentRole } = require('../constants/support');
const { ROLE_LABELS } = require('../constants/roles');
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

const supportTicketController = {
    async listTickets(req, res) {
        try {
            const user = getRequestUser(req);
            if (!user) {
                pushFlashMessage(req, 'error_msg', 'Você precisa estar logado para acessar esta página.');
                return res.redirect('/login');
            }

            const tickets = await supportTicketService.listTicketsForUser({ user });

            res.render('support/tickets', {
                tickets,
                statuses: TICKET_STATUSES,
                isAgent: isSupportAgentRole(user.role),
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
