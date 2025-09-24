const {
    ensureTicketAccess,
    ensureAdminRole,
    createAttachment,
    loadTicketHistory,
    listTicketAttachments,
    notifyAdminJoined,
    getAttachmentById
} = require('../services/supportChatService');
const supportTicketService = require('../services/supportTicketService');
const supportChatbotService = require('../services/supportChatbotService');
const fileStorageService = require('../services/fileStorageService');

const getRequestUser = (req) => {
    if (req.user && req.user.active) {
        return req.user;
    }

    if (req.session && req.session.user) {
        return req.session.user;
    }

    return null;
};

const supportController = {
    async renderChat(req, res) {
        try {
            const user = getRequestUser(req);
            if (!user) {
                return res.redirect('/login');
            }

            const ticketId = Number.parseInt(req.params.ticketId, 10);
            const access = await ensureTicketAccess(ticketId, user);
            const { ticket } = access;
            const [history, attachments] = await Promise.all([
                loadTicketHistory(ticket.id),
                listTicketAttachments(ticket.id)
            ]);

            const plainTicket = typeof ticket.get === 'function'
                ? ticket.get({ plain: true })
                : ticket;

            res.render('support/chat', {
                ticket: plainTicket,
                history,
                attachments,
                user,
                permissions: {
                    isOwner: Boolean(access.isOwner),
                    isAdmin: Boolean(access.isAdmin),
                    isAgent: Boolean(access.isAgent),
                    isAssigned: Boolean(access.isAssigned)
                }
            });
        } catch (error) {
            const status = error?.status || 500;
            if (status >= 500) {
                console.error('Erro ao renderizar chat de suporte:', error);
            }

            req.flash('error_msg', error?.message || 'Não foi possível carregar o chat.');
            res.redirect('/');
        }
    },

    async uploadAttachment(req, res) {
        try {
            const user = getRequestUser(req);
            if (!user) {
                return res.status(401).json({ message: 'Autenticação necessária.' });
            }

            const ticketId = Number.parseInt(req.params.ticketId, 10);
            await ensureTicketAccess(ticketId, user);

            if (!req.file) {
                return res.status(400).json({ message: 'Arquivo obrigatório.' });
            }

            const attachment = await createAttachment({
                ticketId,
                file: req.file
            });

            return res.status(201).json({ attachment });
        } catch (error) {
            if (error.status) {
                return res.status(error.status).json({ message: error.message });
            }
            console.error('Erro ao anexar arquivo ao ticket:', error);
            return res.status(500).json({ message: 'Erro ao anexar arquivo.' });
        }
    },

    async fetchHistory(req, res) {
        try {
            const user = getRequestUser(req);
            if (!user) {
                return res.status(401).json({ message: 'Autenticação necessária.' });
            }

            const ticketId = Number.parseInt(req.params.ticketId, 10);
            await ensureTicketAccess(ticketId, user);
            const [history, attachments] = await Promise.all([
                loadTicketHistory(ticketId),
                listTicketAttachments(ticketId)
            ]);

            return res.json({ history, attachments });
        } catch (error) {
            if (error.status) {
                return res.status(error.status).json({ message: error.message });
            }
            console.error('Erro ao recuperar histórico do chat:', error);
            return res.status(500).json({ message: 'Erro ao carregar histórico.' });
        }
    },

    async notifyAdminEntry(req, res) {
        try {
            const user = getRequestUser(req);
            if (!user) {
                return res.status(401).json({ message: 'Autenticação necessária.' });
            }

            ensureAdminRole(user);
            const ticketId = Number.parseInt(req.params.ticketId, 10);
            const { ticket } = await ensureTicketAccess(ticketId, user);
            await notifyAdminJoined({ ticket, adminUser: user });

            return res.json({ ok: true });
        } catch (error) {
            if (error.status) {
                return res.status(error.status).json({ message: error.message });
            }
            console.error('Erro ao notificar entrada do administrador:', error);
            return res.status(500).json({ message: 'Erro ao notificar entrada.' });
        }
    },

    async startChatFromChatbot(req, res) {
        try {
            const user = getRequestUser(req);
            if (!user) {
                return res.status(401).json({ message: 'Autenticação necessária.' });
            }

            const { topicId, details } = req.body || {};
            const topic = supportChatbotService.getTopicById(topicId);

            if (!topic) {
                return res.status(400).json({ message: 'Seleção do assistente virtual inválida.' });
            }

            const userNotes = supportChatbotService.normalizeDetails(details);

            const descriptionSections = [
                'Solicitação encaminhada pelo assistente virtual interno.',
                `Tópico consultado: ${topic.title}.`,
                topic.summary ? `Resumo sugerido: ${topic.summary}` : null,
                Array.isArray(topic.steps) && topic.steps.length
                    ? `Passos já orientados:\n- ${topic.steps.join('\n- ')}`
                    : null,
                topic.expectedResult ? `Resultado esperado: ${topic.expectedResult}` : null,
                userNotes ? `Observações adicionais do usuário: ${userNotes}` : null
            ].filter(Boolean);

            const description = descriptionSections.join('\n\n');

            const { ticket } = await supportTicketService.createTicket({
                subject: `[Assistente] ${topic.title}`,
                description,
                creator: user,
                attachments: [],
                ipAddress: req.ip
            });

            return res.status(201).json({
                message: 'Chamado em tempo real criado com sucesso.',
                ticketId: ticket.id,
                chatUrl: `/support/tickets/${ticket.id}/chat`,
                ticketUrl: `/support/tickets/${ticket.id}`
            });
        } catch (error) {
            console.error('Erro ao iniciar chamado via assistente virtual:', error);
            return res.status(500).json({ message: 'Não foi possível iniciar o atendimento em tempo real.' });
        }
    },

    async downloadAttachment(req, res) {
        try {
            const user = getRequestUser(req);
            if (!user) {
                return res.redirect('/login');
            }

            const attachmentId = Number.parseInt(req.params.attachmentId, 10);
            const attachment = await getAttachmentById(attachmentId);

            if (!attachment) {
                return res.status(404).send('Anexo não encontrado.');
            }

            await ensureTicketAccess(attachment.ticketId, user);

            const plainAttachment = typeof attachment.get === 'function'
                ? attachment.get({ plain: true })
                : attachment;

            const contentType = plainAttachment.contentType || plainAttachment.mimeType || 'application/octet-stream';
            const fileNameSource = plainAttachment.fileName || plainAttachment.originalName || 'anexo';
            const safeFileName = String(fileNameSource)
                .replace(/[\r\n]+/g, ' ')
                .replace(/"/g, '')
                .trim() || 'anexo';

            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);

            if (Number.isFinite(Number(plainAttachment.fileSize))) {
                res.setHeader('Content-Length', String(plainAttachment.fileSize));
            }

            const stream = fileStorageService.createReadStream(attachment.storageKey);
            stream.on('error', (error) => {
                console.error('Erro ao enviar anexo do suporte:', error);
                if (!res.headersSent) {
                    res.status(500).send('Erro ao enviar arquivo.');
                }
            });
            stream.pipe(res);
        } catch (error) {
            console.error('Erro ao fazer download do anexo do suporte:', error);
            if (!res.headersSent) {
                res.status(500).send('Erro ao baixar anexo.');
            }
        }
    }
};

module.exports = supportController;

