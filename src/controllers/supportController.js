const crypto = require('crypto');

const { SupportTicket, SupportAttachment, User, sequelize } = require('../../database/models');
const { USER_ROLES, roleAtLeast } = require('../constants/roles');

const STATUS_LABELS = Object.freeze({
    open: 'Aberto',
    'in-progress': 'Em andamento',
    closed: 'Resolvido'
});

const PRIORITY_LABELS = Object.freeze({
    low: 'Baixa',
    medium: 'Média',
    high: 'Alta'
});

const PRIORITY_VALUES = new Set(Object.keys(PRIORITY_LABELS));

const normalizePriority = (value) => {
    if (!value) {
        return 'medium';
    }

    const normalized = String(value).trim().toLowerCase();
    if (PRIORITY_VALUES.has(normalized)) {
        return normalized;
    }

    return 'medium';
};

const formatDateTime = (value) => {
    if (!value) {
        return '';
    }

    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) {
        return '';
    }

    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const prepareTicketForView = (ticket) => {
    const plain = ticket.get({ plain: true });
    const attachments = Array.isArray(plain.attachments) ? plain.attachments : [];

    return {
        ...plain,
        createdAtFormatted: formatDateTime(plain.createdAt),
        updatedAtFormatted: formatDateTime(plain.updatedAt),
        statusLabel: STATUS_LABELS[plain.status] || plain.status,
        priorityLabel: PRIORITY_LABELS[plain.priority] || plain.priority,
        attachmentCount: attachments.length,
        attachments: attachments.map((attachment) => ({
            ...attachment,
            sizeFormatted: `${Math.max(1, Math.ceil(Number(attachment.size || 0) / 1024))} KB`
        }))
    };
};

module.exports = {
    async listTickets(req, res) {
        try {
            const isAdmin = roleAtLeast(req.user.role, USER_ROLES.ADMIN);
            const tickets = await SupportTicket.findAll({
                where: isAdmin ? {} : { userId: req.user.id },
                include: [
                    {
                        model: SupportAttachment,
                        as: 'attachments',
                        attributes: ['id', 'size']
                    },
                    {
                        model: User,
                        as: 'requester',
                        attributes: ['id', 'name', 'email']
                    }
                ],
                order: [['createdAt', 'DESC']]
            });

            const formattedTickets = tickets.map(prepareTicketForView);

            res.render('support/listTickets', {
                pageTitle: 'Central de suporte',
                tickets: formattedTickets,
                statusLabels: STATUS_LABELS,
                priorityLabels: PRIORITY_LABELS,
                isAdmin
            });
        } catch (error) {
            console.error('Erro ao listar tickets de suporte:', error);
            req.flash('error_msg', 'Não foi possível carregar seus chamados no momento.');
            return res.redirect('/');
        }
    },

    async showCreateForm(req, res) {
        res.render('support/newTicket', {
            pageTitle: 'Abrir chamado',
            priorityLabels: PRIORITY_LABELS
        });
    },

    async createTicket(req, res) {
        const subject = typeof req.body.subject === 'string' ? req.body.subject.trim() : '';
        const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
        const priority = normalizePriority(req.body.priority);

        if (!subject || !description) {
            req.flash('error_msg', 'Informe um assunto e descreva o que está acontecendo.');
            return res.redirect('/support/tickets/new');
        }

        const files = Array.isArray(req.files) ? req.files : [];
        const transaction = await sequelize.transaction();

        try {
            const ticket = await SupportTicket.create({
                userId: req.user.id,
                subject,
                description,
                priority
            }, { transaction });

            if (files.length) {
                const attachmentsPayload = files.map((file) => ({
                    ticketId: ticket.id,
                    fileName: file.originalname,
                    mimeType: file.mimetype,
                    size: file.size,
                    checksum: crypto.createHash('sha256').update(file.buffer).digest('hex'),
                    data: file.buffer
                }));

                await SupportAttachment.bulkCreate(attachmentsPayload, { transaction });
            }

            await transaction.commit();
            req.flash('success_msg', 'Chamado aberto com sucesso! Nossa equipe retornará em breve.');
            return res.redirect('/support/tickets');
        } catch (error) {
            await transaction.rollback();
            console.error('Erro ao criar ticket de suporte:', error);
            req.flash('error_msg', 'Não foi possível abrir o chamado. Tente novamente.');
            return res.redirect('/support/tickets/new');
        }
    },

    async viewTicket(req, res) {
        const { id } = req.params;

        try {
            const ticket = await SupportTicket.findByPk(id, {
                include: [
                    {
                        model: SupportAttachment,
                        as: 'attachments',
                        attributes: ['id', 'fileName', 'mimeType', 'size', 'createdAt']
                    },
                    {
                        model: User,
                        as: 'requester',
                        attributes: ['id', 'name', 'email']
                    }
                ],
                order: [[{ model: SupportAttachment, as: 'attachments' }, 'createdAt', 'ASC']]
            });

            if (!ticket) {
                req.flash('error_msg', 'Chamado de suporte não encontrado.');
                return res.redirect('/support/tickets');
            }

            const isAdmin = roleAtLeast(req.user.role, USER_ROLES.ADMIN);
            if (!isAdmin && ticket.userId !== req.user.id) {
                req.flash('error_msg', 'Você não tem permissão para visualizar este chamado.');
                return res.redirect('/support/tickets');
            }

            const formattedTicket = prepareTicketForView(ticket);

            res.render('support/ticketDetail', {
                pageTitle: `Chamado #${ticket.id}`,
                ticket: formattedTicket,
                statusLabels: STATUS_LABELS,
                priorityLabels: PRIORITY_LABELS,
                isAdmin
            });
        } catch (error) {
            console.error('Erro ao visualizar ticket de suporte:', error);
            req.flash('error_msg', 'Não foi possível exibir os detalhes do chamado.');
            return res.redirect('/support/tickets');
        }
    }
};
