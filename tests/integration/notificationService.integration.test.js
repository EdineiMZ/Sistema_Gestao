process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

jest.mock('../../src/utils/email', () => ({
    sendEmail: jest.fn()
}));

const { sequelize, Notification, User, UserNotificationPreference, Appointment, Procedure } = require('../../database/models');
const { sendEmail } = require('../../src/utils/email');
const { processNotifications } = require('../../src/services/notificationService');

const buildUserPayload = (overrides = {}) => ({
    name: 'Usuário Teste',
    email: 'usuario@example.com',
    password: 'Senha@123',
    role: 'client',
    phone: '11999998888',
    address: 'Rua de Teste, 123',
    active: true,
    ...overrides
});

describe('notificationService integration - opt-in gating', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        await sequelize.sync({ force: true });
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('não envia notificações customizadas para usuários sem opt-in de e-mail', async () => {
        const user = await User.create(buildUserPayload());
        await UserNotificationPreference.create({
            userId: user.id,
            emailEnabled: false,
            scheduledEnabled: true
        });

        await Notification.create({
            title: 'Campanha de novidades',
            message: 'Olá %USUARIO%',
            messageHtml: '<p>Olá %USUARIO%</p>',
            type: 'custom',
            sendToAll: true,
            active: true,
            filters: {},
            accentColor: '#0d6efd'
        });

        await processNotifications();

        expect(sendEmail).not.toHaveBeenCalled();
    });

    it('ignora lembretes de agendamento para profissionais com opt-in de agenda desativado', async () => {
        const professional = await User.create(buildUserPayload({
            name: 'Profissional Agenda',
            email: 'pro-agenda@example.com'
        }));

        await UserNotificationPreference.create({
            userId: professional.id,
            emailEnabled: true,
            scheduledEnabled: false
        });

        const procedure = await Procedure.create({
            name: 'Consulta',
            price: 150,
            active: true
        });

        const start = new Date(Date.now() + 30 * 60000);
        const end = new Date(start.getTime() + 30 * 60000);

        await Appointment.create({
            description: 'Consulta de retorno',
            professionalId: professional.id,
            procedureId: procedure.id,
            roomId: null,
            start,
            end,
            status: 'scheduled'
        });

        await Notification.create({
            title: 'Lembrete de compromisso',
            message: 'Você possui um agendamento próximo.',
            messageHtml: '<p>Você possui um agendamento próximo.</p>',
            type: 'appointment',
            sendToAll: false,
            active: true,
            filters: {
                includeClient: false,
                includeProfessional: true,
                timeWindowMinutes: 90
            },
            accentColor: '#198754'
        });

        await processNotifications();

        expect(sendEmail).not.toHaveBeenCalled();
    });
});
