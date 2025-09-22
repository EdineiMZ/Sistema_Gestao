const { USER_ROLES } = require('../../../src/constants/roles');

jest.mock('../../../database/models', () => {
    const SupportTicket = { findByPk: jest.fn() };
    const SupportMessage = {
        findAll: jest.fn(),
        create: jest.fn(),
        findByPk: jest.fn()
    };
    const SupportAttachment = {
        findAll: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        findByPk: jest.fn()
    };

    return {
        SupportTicket,
        SupportMessage,
        SupportAttachment,
        Notification: { create: jest.fn() },
        User: {}
    };
});

const models = require('../../../database/models');
const {
    ensureTicketAccess
} = require('../../../src/services/supportChatService');

describe('supportChatService.ensureTicketAccess', () => {
    const baseTicket = {
        id: 100,
        creatorId: 1,
        assignedToId: null
    };

    const buildUser = (overrides = {}) => ({
        id: 99,
        role: USER_ROLES.CLIENT,
        active: true,
        ...overrides
    });

    beforeEach(() => {
        jest.clearAllMocks();
        models.SupportTicket.findByPk.mockResolvedValue({ ...baseTicket });
    });

    it('permite que o criador do ticket acesse o chat', async () => {
        const user = buildUser({ id: baseTicket.creatorId });

        const access = await ensureTicketAccess(baseTicket.id, user);

        expect(access.ticket.id).toBe(baseTicket.id);
        expect(access.isOwner).toBe(true);
        expect(access.isAdmin).toBe(false);
        expect(access.isAgent).toBe(false);
        expect(access.isAssigned).toBe(false);
    });

    it('permite que um administrador acesse qualquer ticket', async () => {
        const user = buildUser({
            role: USER_ROLES.ADMIN
        });

        const access = await ensureTicketAccess(baseTicket.id, user);

        expect(access.isAdmin).toBe(true);
        expect(access.isAgent).toBe(true);
    });

    it('permite que um colaborador com papel de suporte acesse o ticket', async () => {
        const user = buildUser({
            id: 55,
            role: USER_ROLES.COLLABORATOR
        });

        const access = await ensureTicketAccess(baseTicket.id, user);

        expect(access.isAgent).toBe(true);
        expect(access.isAssigned).toBe(false);
    });

    it('permite que o responsável designado acesse o ticket mesmo sem papel de agente', async () => {
        const assignedUser = buildUser({ id: 77 });
        models.SupportTicket.findByPk.mockResolvedValue({
            ...baseTicket,
            assignedToId: assignedUser.id
        });

        const access = await ensureTicketAccess(baseTicket.id, assignedUser);

        expect(access.isAssigned).toBe(true);
        expect(access.isAgent).toBe(false);
    });

    it('bloqueia usuários sem permissão alguma', async () => {
        const user = buildUser({ id: 404 });

        await expect(ensureTicketAccess(baseTicket.id, user)).rejects.toMatchObject({
            message: 'FORBIDDEN',
            status: 403
        });
    });
});
