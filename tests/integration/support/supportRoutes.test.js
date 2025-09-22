process.env.NODE_ENV = 'test';

const express = require('express');
const request = require('supertest');
const { Readable } = require('stream');

let mockCurrentUser = {
    id: 1,
    role: 'client',
    active: true,
    name: 'Cliente Teste',
    email: 'cliente@example.com'
};

jest.mock('../../../src/middlewares/authMiddleware', () => jest.fn((req, res, next) => {
    req.user = { ...mockCurrentUser };
    next();
}));

jest.mock('../../../src/services/supportChatService', () => ({
    ensureTicketAccess: jest.fn(),
    ensureAdminRole: jest.fn(),
    createAttachment: jest.fn(),
    loadTicketHistory: jest.fn(),
    listTicketAttachments: jest.fn(),
    notifyAdminJoined: jest.fn(),
    getAttachmentById: jest.fn(),
    constants: {
        MAX_FILE_SIZE: 1024
    }
}));

jest.mock('../../../src/services/fileStorageService', () => ({
    createReadStream: jest.fn()
}));

const supportRoutes = require('../../../src/routes/supportRoutes');
const supportChatService = require('../../../src/services/supportChatService');
const fileStorageService = require('../../../src/services/fileStorageService');

const buildApp = () => {
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    app.use('/support', supportRoutes);
    return app;
};

describe('Rotas de suporte - chat e anexos', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        mockCurrentUser = {
            id: 1,
            role: 'client',
            active: true,
            name: 'Cliente Teste',
            email: 'cliente@example.com'
        };
        app = buildApp();
        supportChatService.ensureTicketAccess.mockResolvedValue({ ticket: { id: 1 } });
        supportChatService.createAttachment.mockResolvedValue({
            id: 10,
            ticketId: 1,
            fileName: 'log.txt',
            contentType: 'text/plain',
            fileSize: 42,
            originalName: 'log.txt',
            mimeType: 'text/plain',
            size: 42
        });
        supportChatService.loadTicketHistory.mockResolvedValue([
            {
                id: 1,
                body: 'Mensagem',
                isFromAgent: false,
                isSystem: false,
                createdAt: new Date().toISOString(),
                attachment: {
                    id: 50,
                    fileName: 'relatorio.pdf',
                    contentType: 'application/pdf',
                    fileSize: 1024,
                    originalName: 'relatorio.pdf',
                    mimeType: 'application/pdf',
                    size: 1024
                }
            }
        ]);
        supportChatService.listTicketAttachments.mockResolvedValue([
            {
                id: 9,
                ticketId: 1,
                fileName: 'erro.pdf',
                contentType: 'application/pdf',
                fileSize: 2048,
                originalName: 'erro.pdf',
                mimeType: 'application/pdf',
                size: 2048
            }
        ]);
        supportChatService.getAttachmentById.mockResolvedValue({
            id: 9,
            ticketId: 1,
            contentType: 'text/plain',
            fileName: 'log.txt',
            fileSize: 8,
            storageKey: 'support/log.txt'
        });
        fileStorageService.createReadStream.mockReturnValue(Readable.from('conteudo'));
    });

    it('permite enviar anexos para um ticket existente', async () => {
        const response = await request(app)
            .post('/support/tickets/1/attachments')
            .attach('file', Buffer.from('log de teste'), 'log.txt');

        expect(response.status).toBe(201);
        expect(response.body.attachment).toMatchObject({
            fileName: 'log.txt',
            contentType: 'text/plain',
            fileSize: 42,
            originalName: 'log.txt'
        });
        expect(supportChatService.createAttachment).toHaveBeenCalledWith({
            ticketId: 1,
            file: expect.objectContaining({ originalname: 'log.txt' })
        });
    });

    it('retorna erro quando nenhum arquivo é enviado', async () => {
        const response = await request(app)
            .post('/support/tickets/1/attachments');

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('Arquivo obrigatório.');
        expect(supportChatService.createAttachment).not.toHaveBeenCalled();
    });

    it('recupera histórico e anexos do ticket autenticado', async () => {
        const response = await request(app).get('/support/tickets/1/history');

        expect(response.status).toBe(200);
        expect(response.body.history).toHaveLength(1);
        expect(response.body.attachments).toHaveLength(1);
        expect(response.body.attachments[0]).toMatchObject({
            fileName: 'erro.pdf',
            contentType: 'application/pdf',
            fileSize: 2048,
            originalName: 'erro.pdf'
        });
        expect(response.body.history[0].attachment).toMatchObject({
            fileName: 'relatorio.pdf',
            contentType: 'application/pdf',
            fileSize: 1024
        });
        expect(response.body.history[0].attachment.originalName).toBe('relatorio.pdf');
        expect(supportChatService.loadTicketHistory).toHaveBeenCalledWith(1);
        expect(supportChatService.listTicketAttachments).toHaveBeenCalledWith(1);
    });

    it('permite que um administrador notifique a entrada no chat', async () => {
        mockCurrentUser = {
            id: 2,
            role: 'admin',
            active: true,
            name: 'Admin',
            email: 'admin@example.com'
        };

        const response = await request(app)
            .post('/support/tickets/1/notify-admin-entry')
            .send();

        expect(response.status).toBe(200);
        expect(response.body.ok).toBe(true);
        expect(supportChatService.notifyAdminJoined).toHaveBeenCalledWith({
            ticket: expect.objectContaining({ id: 1 }),
            adminUser: expect.objectContaining({ id: 2 })
        });
    });

    it('bloqueia usuários sem perfil admin ao notificar entrada no chat', async () => {
        const error = new Error('ADMIN_REQUIRED');
        error.status = 403;
        supportChatService.ensureAdminRole.mockImplementation(() => { throw error; });

        const response = await request(app)
            .post('/support/tickets/1/notify-admin-entry')
            .send();

        expect(response.status).toBe(403);
        expect(response.body.message).toBe('ADMIN_REQUIRED');
        expect(supportChatService.notifyAdminJoined).not.toHaveBeenCalled();
    });

    it('permite download de anexo quando o usuário tem acesso', async () => {
        const response = await request(app).get('/support/attachments/9/download');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('text/plain');
        expect(response.headers['content-disposition']).toContain('filename="log.txt"');
        expect(response.headers['content-length']).toBe('8');
        expect(fileStorageService.createReadStream).toHaveBeenCalledWith('support/log.txt');
    });

    it('retorna 404 quando o anexo não existe', async () => {
        supportChatService.getAttachmentById.mockResolvedValue(null);

        const response = await request(app).get('/support/attachments/99/download');

        expect(response.status).toBe(404);
        expect(fileStorageService.createReadStream).not.toHaveBeenCalled();
    });
});
