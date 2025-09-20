'use strict';

const mockTransaction = { LOCK: { UPDATE: Symbol('update') } };

const mockTicketInstance = (overrides = {}) => ({
    id: overrides.id ?? 1,
    creatorId: overrides.creatorId ?? 10,
    assignedToId: overrides.assignedToId ?? null,
    status: overrides.status ?? 'pending',
    firstResponseAt: overrides.firstResponseAt ?? null,
    resolvedAt: overrides.resolvedAt ?? null,
    createdAt: overrides.createdAt ?? new Date('2024-09-20T10:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2024-09-20T10:00:00Z'),
    get: jest.fn(function getPlain() {
        return { ...this };
    }),
    update: jest.fn(async function update(values) {
        Object.assign(this, values);
        return this;
    }),
    ...overrides
});

const mockMessageInstance = (overrides = {}) => ({
    id: overrides.id ?? 25,
    ticketId: overrides.ticketId ?? 1,
    senderId: overrides.senderId ?? 10,
    body: overrides.body ?? '<p>Mensagem</p>',
    isFromAgent: overrides.isFromAgent ?? false,
    createdAt: overrides.createdAt ?? new Date('2024-09-20T11:00:00Z'),
    ...overrides
});

const mockSequelizeTransaction = jest.fn(async (handler) => handler(mockTransaction));
const mockTicketCreate = jest.fn();
const mockTicketFindAll = jest.fn();
const mockTicketFindByPk = jest.fn();
const mockMessageCreate = jest.fn();
const mockAttachmentBulkCreate = jest.fn();
const mockAuditCreate = jest.fn();
const mockUserFindByPk = jest.fn();

jest.mock('../../../database/models', () => ({
    sequelize: { transaction: mockSequelizeTransaction },
    SupportTicket: {
        create: mockTicketCreate,
        findAll: mockTicketFindAll,
        findByPk: mockTicketFindByPk
    },
    SupportMessage: {
        create: mockMessageCreate
    },
    SupportAttachment: {
        bulkCreate: mockAttachmentBulkCreate
    },
    User: {
        findByPk: mockUserFindByPk
    },
    AuditLog: {
        create: mockAuditCreate
    }
}));

const {
    createTicket,
    addMessage,
    updateTicketStatus,
    assignTicket,
    listTicketsForUser
} = require('../../../src/services/supportTicketService');

describe('supportTicketService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('adiciona campos derivados ao listar chamados', async () => {
        const baseDate = new Date('2024-09-20T10:00:00Z');
        const ticket = mockTicketInstance({
            priority: 'HIGH',
            createdAt: baseDate,
            updatedAt: new Date('2024-09-20T11:00:00Z'),
            lastMessageAt: new Date('2024-09-20T11:30:00Z'),
            attachments: [
                { id: 1, messageId: 99, fileName: 'erro.png', fileSize: 1024, createdAt: new Date('2024-09-20T11:10:00Z') }
            ],
            messages: [
                {
                    id: 99,
                    ticketId: 1,
                    senderId: 10,
                    body: '<p>Mensagem</p>',
                    isFromAgent: false,
                    isSystem: false,
                    createdAt: new Date('2024-09-20T11:05:00Z'),
                    sender: { id: 10, name: 'Cliente', role: 'client' }
                }
            ],
            creator: { id: 10, name: 'Cliente', email: 'cliente@example.com', role: 'client' }
        });

        mockTicketFindAll.mockResolvedValueOnce([ticket]);

        const [result] = await listTicketsForUser({ user: { id: 10, role: 'client' } });

        expect(mockTicketFindAll).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ creatorId: 10 })
        }));
        expect(result).toEqual(expect.objectContaining({
            statusLabel: 'Pendente',
            priority: 'high',
            priorityLabel: 'Alta',
            attachmentCount: 1
        }));
        expect(result.attachments).toHaveLength(1);
        expect(result.messages[0].attachments).toHaveLength(1);
        expect(result.createdAtFormatted).toBeTruthy();
        expect(result.updatedAtFormatted).toBeTruthy();
    });

    it('cria um chamado com mensagem inicial e anexos em transação', async () => {
        const ticket = mockTicketInstance({ id: 5 });
        const message = mockMessageInstance({ id: 44, ticketId: 5 });

        mockTicketCreate.mockResolvedValueOnce(ticket);
        mockMessageCreate.mockResolvedValueOnce(message);
        mockAttachmentBulkCreate.mockResolvedValueOnce([]);

        await createTicket({
            subject: 'Erro no painel',
            description: '<p>Detalhes do erro</p>',
            creator: { id: 99, role: 'client' },
            attachments: [
                { fileName: 'evidencia.png', storageKey: 'abc/123', fileSize: 2048 }
            ],
            assignedToId: null,
            ipAddress: '127.0.0.1'
        });

        expect(mockSequelizeTransaction).toHaveBeenCalledTimes(1);
        expect(mockTicketCreate).toHaveBeenCalledWith(expect.objectContaining({
            subject: 'Erro no painel',
            creatorId: 99,
            status: 'pending'
        }), expect.objectContaining({ transaction: mockTransaction }));

        expect(mockMessageCreate).toHaveBeenCalledWith(expect.objectContaining({
            ticketId: 5,
            senderId: 99,
            isFromAgent: false
        }), expect.objectContaining({ transaction: mockTransaction }));

        expect(mockAttachmentBulkCreate).toHaveBeenCalledWith([
            expect.objectContaining({
                ticketId: 5,
                messageId: 44,
                uploadedById: 99,
                fileName: 'evidencia.png'
            })
        ], expect.objectContaining({ transaction: mockTransaction }));

        expect(ticket.update).toHaveBeenCalledWith(expect.objectContaining({
            lastMessageAt: expect.any(Date)
        }), expect.objectContaining({ transaction: mockTransaction }));

        expect(mockAuditCreate).toHaveBeenCalledWith(expect.objectContaining({
            action: 'support.ticket.create',
            resource: 'support_ticket:5'
        }), expect.objectContaining({ transaction: mockTransaction }));
    });

    it('impede resposta de usuário sem permissão', async () => {
        const ticket = mockTicketInstance({ id: 12, creatorId: 1, status: 'pending' });

        mockTicketFindByPk.mockResolvedValueOnce(ticket);

        await expect(addMessage({
            ticketId: 12,
            sender: { id: 2, role: 'client' },
            body: 'Atualização',
            attachments: []
        })).rejects.toThrow('Você não possui permissão para responder este chamado.');

        expect(mockMessageCreate).not.toHaveBeenCalled();
    });

    it('transiciona o status para em andamento quando atendente responde', async () => {
        const ticket = mockTicketInstance({ id: 9, creatorId: 1, status: 'pending', firstResponseAt: null });
        const message = mockMessageInstance({ id: 101, ticketId: 9, senderId: 3 });

        mockTicketFindByPk.mockResolvedValueOnce(ticket);
        mockMessageCreate.mockResolvedValueOnce(message);

        await addMessage({
            ticketId: 9,
            sender: { id: 3, role: 'manager' },
            body: 'Mensagem do suporte',
            attachments: []
        });

        expect(ticket.update).toHaveBeenCalledWith(expect.objectContaining({
            status: 'in_progress',
            firstResponseAt: expect.any(Date)
        }), expect.objectContaining({ transaction: mockTransaction }));
    });

    it('não aceita status inválido', async () => {
        await expect(updateTicketStatus({
            ticketId: 1,
            status: 'arquivado',
            actor: { id: 1, role: 'manager' }
        })).rejects.toThrow('Status informado é inválido.');
    });

    it('permite que atendente finalize chamado', async () => {
        const ticket = mockTicketInstance({ id: 30, status: 'in_progress', creatorId: 5 });

        mockTicketFindByPk.mockResolvedValueOnce(ticket);

        await updateTicketStatus({
            ticketId: 30,
            status: 'resolved',
            actor: { id: 8, role: 'manager' }
        });

        expect(ticket.update).toHaveBeenCalledWith(expect.objectContaining({
            status: 'resolved',
            resolvedAt: expect.any(Date)
        }), expect.objectContaining({ transaction: mockTransaction }));
    });

    it('permite que o criador conclua o próprio chamado em andamento', async () => {
        const ticket = mockTicketInstance({ id: 45, status: 'in_progress', creatorId: 21 });

        mockTicketFindByPk.mockResolvedValueOnce(ticket);

        await updateTicketStatus({
            ticketId: 45,
            status: 'resolved',
            actor: { id: 21, role: 'client' }
        });

        expect(ticket.update).toHaveBeenCalledWith(expect.objectContaining({
            status: 'resolved',
            resolvedAt: expect.any(Date)
        }), expect.objectContaining({ transaction: mockTransaction }));
    });

    it('bloqueia alteração de status para valor restrito por clientes', async () => {
        const ticket = mockTicketInstance({ id: 46, status: 'pending', creatorId: 22 });

        mockTicketFindByPk.mockResolvedValueOnce(ticket);

        await expect(updateTicketStatus({
            ticketId: 46,
            status: 'in_progress',
            actor: { id: 22, role: 'client' }
        })).rejects.toThrow('Apenas a equipe de suporte pode alterar o status para este valor.');
    });

    it('impede que usuário não relacionado conclua chamado', async () => {
        const ticket = mockTicketInstance({ id: 47, status: 'in_progress', creatorId: 23 });

        mockTicketFindByPk.mockResolvedValueOnce(ticket);

        await expect(updateTicketStatus({
            ticketId: 47,
            status: 'resolved',
            actor: { id: 99, role: 'client' }
        })).rejects.toThrow('Você não possui permissão para alterar o status deste chamado.');
    });

    it('exige que atribuição seja feita para atendente válido', async () => {
        const ticket = mockTicketInstance({ id: 50 });

        mockTicketFindByPk.mockResolvedValue(ticket);
        mockUserFindByPk.mockResolvedValueOnce({ id: 99, role: 'manager' });

        await assignTicket({
            ticketId: 50,
            assignedToId: 99,
            actor: { id: 77, role: 'manager' }
        });

        expect(ticket.update).toHaveBeenCalledWith({ assignedToId: 99 }, expect.objectContaining({ transaction: mockTransaction }));

        mockUserFindByPk.mockResolvedValueOnce({ id: 55, role: 'client' });

        await expect(assignTicket({
            ticketId: 50,
            assignedToId: 55,
            actor: { id: 77, role: 'manager' }
        })).rejects.toThrow('Usuário selecionado não possui perfil de atendimento.');
    });
});
