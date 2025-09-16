#!/usr/bin/env node
process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = process.env.DB_DIALECT || 'sqlite';
process.env.DB_STORAGE = process.env.DB_STORAGE || ':memory:';
process.env.EMAIL_DISABLED = 'true';
process.env.APP_NAME = process.env.APP_NAME || 'Sistema de Gestão - Teste';

const { sequelize, User, Notification, Procedure, Room, Appointment } = require('../database/models');
const { processNotifications } = require('../src/services/notificationService');

async function run() {
    try {
        await sequelize.sync({ force: true });

        const admin = await User.create({
            name: 'Administrador Teste',
            email: 'admin.teste@example.com',
            password: 'SenhaSegura123',
            role: 4,
            creditBalance: 150
        });

        const profissional = await User.create({
            name: 'Profissional Teste',
            email: 'profissional@example.com',
            password: 'SenhaSegura123',
            role: 3,
            creditBalance: 80
        });

        const procedimento = await Procedure.create({
            name: 'Sessão Premium',
            price: 250,
            active: true
        });

        const sala = await Room.create({
            name: 'Sala Diamante'
        });

        const appointmentStart = new Date(Date.now() + 15 * 60000);
        const appointmentEnd = new Date(Date.now() + 45 * 60000);

        await Appointment.create({
            description: 'Atendimento VIP',
            professionalId: profissional.id,
            clientEmail: 'cliente@example.com',
            roomId: sala.id,
            procedureId: procedimento.id,
            start: appointmentStart,
            end: appointmentEnd,
            status: 'scheduled',
            paymentConfirmed: true
        });

        await Notification.create({
            title: 'Boas-vindas ao sistema',
            message: 'Olá %USUARIO%, seja bem-vindo à %ORGANIZACAO%!',
            type: 'custom',
            active: true,
            sendToAll: true,
            filters: {
                onlyActive: true,
                targetRoles: [4]
            },
            repeatFrequency: 'none'
        });

        await Notification.create({
            title: 'Lembrete de atendimento',
            message: 'Olá %USUARIO%, seu procedimento %AGENDAMENTO_PROCEDIMENTO% está agendado para %AGENDAMENTO_DATA% às %AGENDAMENTO_HORA_INICIO%.',
            messageHtml: '<p>Olá <strong>%USUARIO%</strong>,</p><p>Estamos aguardando você para o procedimento <strong>%AGENDAMENTO_PROCEDIMENTO%</strong> na sala %AGENDAMENTO_SALA%.</p>',
            type: 'appointment',
            triggerDate: new Date(),
            active: true,
            sendToAll: false,
            filters: {
                onlyActive: true,
                includeProfessional: true,
                includeClient: true,
                appointmentStatus: ['scheduled'],
                timeWindowMinutes: 45
            },
            repeatFrequency: 'none'
        });

        await processNotifications();

        console.log('Health check executado com sucesso.');
    } catch (error) {
        console.error('Falha no health-check:', error);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
}

run();
