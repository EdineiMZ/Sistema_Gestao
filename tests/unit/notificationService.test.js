process.env.NODE_ENV = 'test';

const mockDescribeTable = jest.fn().mockResolvedValue({ messageHtml: true });

jest.mock('../../database/models', () => ({
    Sequelize: { Op: require('sequelize').Op },
    Notification: {},
    User: {
        findAll: jest.fn(),
        findByPk: jest.fn()
    },
    Appointment: {
        findAll: jest.fn()
    },
    Procedure: {},
    Room: {},
    UserNotificationPreference: {},
    sequelize: {
        where: jest.fn((...args) => ({ __where__: args })),
        fn: jest.fn(() => ({})),
        col: jest.fn(() => ({})),
        getDialect: jest.fn(() => 'sqlite'),
        getQueryInterface: jest.fn(() => ({ describeTable: mockDescribeTable }))
    }
}));

jest.mock('../../src/utils/email', () => ({
    sendEmail: jest.fn()
}));

const { User, Appointment } = require('../../database/models');
const { sendEmail } = require('../../src/utils/email');
const notificationService = require('../../src/services/notificationService');

const { processCustomNotification, processAppointmentNotification } = notificationService._internal;

describe('notificationService gating logic', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('não envia e-mail quando o opt-in geral está desativado', async () => {
        const disabledUser = {
            id: 10,
            name: 'Usuário Opt-out',
            email: 'optout@example.com',
            active: true,
            notificationPreference: {
                emailEnabled: false,
                scheduledEnabled: true
            }
        };

        User.findAll.mockResolvedValueOnce([disabledUser]);

        const notification = {
            id: 1,
            title: 'Campanha',
            message: 'Olá %USUARIO%',
            accentColor: '#0d6efd',
            filters: {},
            sendToAll: true
        };

        await processCustomNotification(notification);

        expect(User.findAll).toHaveBeenCalledTimes(1);
        expect(sendEmail).not.toHaveBeenCalled();
    });

    it('bloqueia lembretes de agenda quando scheduledEnabled está desativado', async () => {
        const notification = {
            id: 2,
            type: 'appointment',
            title: 'Lembrete',
            message: 'Lembrete de compromisso',
            accentColor: '#6610f2',
            filters: {
                includeClient: false,
                includeProfessional: true,
                timeWindowMinutes: 60
            }
        };

        const appointment = {
            id: 55,
            start: new Date(),
            end: new Date(Date.now() + 3600000),
            status: 'scheduled',
            professional: {
                id: 8,
                name: 'Profissional',
                email: 'pro@example.com',
                active: true,
                notificationPreference: {
                    emailEnabled: true,
                    scheduledEnabled: false
                }
            }
        };

        Appointment.findAll.mockResolvedValueOnce([appointment]);

        await processAppointmentNotification(notification);

        expect(Appointment.findAll).toHaveBeenCalledTimes(1);
        expect(sendEmail).not.toHaveBeenCalled();
    });
});
