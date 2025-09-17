const {
    ensureTicketAccess,
    ensureAdminRole,
    createAttachment,
    loadTicketHistory,
    listTicketAttachments,
    notifyAdminJoined,
    getAttachmentById
} = require('../services/supportChatService');
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
            const { ticket } = await ensureTicketAccess(ticketId, user);
            const [history, attachments] = await Promise.all([
                loadTicketHistory(ticket.id),
                listTicketAttachments(ticket.id)
            ]);

            res.render('support/chat', {
                ticket: ticket.get({ plain: true }),
                history,
                attachments
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

            res.setHeader('Content-Type', attachment.mimeType);
            res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalName}"`);

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
