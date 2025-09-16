#!/usr/bin/env node
process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = process.env.DB_DIALECT || 'sqlite';
process.env.DB_STORAGE = process.env.DB_STORAGE || ':memory:';
process.env.EMAIL_DISABLED = 'true';
process.env.APP_NAME = process.env.APP_NAME || 'Sistema de Gestão - Teste';

const path = require('path');
const { spawn } = require('child_process');

const { sequelize, User, Notification, Procedure, Room, Appointment } = require('../database/models');
const argon2 = require('argon2');
const { processNotifications } = require('../src/services/notificationService');
const { USER_ROLES } = require('../src/constants/roles');

const TEST_SERVER_PORT = Number.parseInt(process.env.TEST_SERVER_PORT || '3456', 10);

const SERVER_START_TIMEOUT = Number.parseInt(process.env.TEST_SERVER_START_TIMEOUT || '12000', 10);

function waitForServerReady(server, port, timeout = SERVER_START_TIMEOUT) {
    return new Promise((resolve, reject) => {
        let settled = false;

        const handleStdout = (chunk) => {
            const text = chunk.toString();
            if (text.includes('Servidor rodando')) {
                settled = true;
                cleanup();
                resolve();
            }
        };

        const handleStderr = (chunk) => {
            const text = chunk.toString();
            process.stderr.write(`[server:test] ${text}`);
        };

        const handleExit = (code) => {
            if (!settled) {
                cleanup();
                reject(new Error(`Servidor de teste finalizou antes de estar pronto (código ${code}).`));
            }
        };

        const handleError = (error) => {
            if (!settled) {
                cleanup();
                reject(error);
            }
        };

        const cleanup = () => {
            clearTimeout(timer);
            server.stdout.off('data', handleStdout);
            server.stderr.off('data', handleStderr);
            server.off('exit', handleExit);
            server.off('error', handleError);
        };

        const timer = setTimeout(() => {
            if (!settled) {
                cleanup();
                reject(new Error(`Tempo limite ao aguardar servidor de teste na porta ${port}.`));
            }
        }, timeout);

        server.stdout.on('data', handleStdout);
        server.stderr.on('data', handleStderr);
        server.on('exit', handleExit);
        server.on('error', handleError);
    });
}

function stopServer(server) {
    return new Promise((resolve) => {
        if (!server) {
            return resolve();
        }

        const finalize = () => {
            clearTimeout(forceKillTimer);
            resolve();
        };

        const forceKillTimer = setTimeout(() => {
            if (!server.killed) {
                server.kill('SIGKILL');
            }
        }, 3000);

        if (server.exitCode !== null || server.signalCode) {
            finalize();
            return;
        }

        server.once('exit', finalize);
        server.kill();
    });
}

async function ensureNoNotificationBadge(url) {
    const response = await fetch(url, { headers: { accept: 'text/html' } });
    if (!response.ok) {
        throw new Error(`Falha ao acessar ${url}: status ${response.status}`);
    }

    const body = await response.text();
    if (body.includes('data-testid="notification-badge"')) {
        throw new Error(`Balão de notificações encontrado em ${url}`);
    }
}

async function runNotificationBadgeE2E() {
    if (typeof fetch !== 'function') {
        throw new Error('Fetch API indisponível no ambiente de teste.');
    }

    const serverPath = path.join(__dirname, '..', 'server.js');
    const env = {
        ...process.env,
        PORT: String(TEST_SERVER_PORT),
        NODE_ENV: 'test',
        DB_DIALECT: 'sqlite',
        DB_STORAGE: ':memory:',
        SESSION_SECRET: process.env.SESSION_SECRET || 'test-session-secret',
        EMAIL_DISABLED: 'true',
        APP_NAME: process.env.APP_NAME || 'Sistema de Gestão - Teste'
    };

    const server = spawn(process.execPath, [serverPath], {
        env,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    try {
        await waitForServerReady(server, TEST_SERVER_PORT);

        await ensureNoNotificationBadge(`http://127.0.0.1:${TEST_SERVER_PORT}/login`);
        await ensureNoNotificationBadge(`http://127.0.0.1:${TEST_SERVER_PORT}/register`);

        console.log('Teste E2E das páginas públicas executado com sucesso.');
    } finally {
        await stopServer(server);
    }
}

async function run() {
    try {
        await sequelize.sync({ force: true });

        const admin = await User.create({
            name: 'Administrador Teste',
            email: 'admin.teste@example.com',
            password: 'SenhaSegura123',
            role: USER_ROLES.ADMIN,
            creditBalance: 150
        });

        const profissional = await User.create({
            name: 'Profissional Teste',
            email: 'profissional@example.com',
            password: 'SenhaSegura123',
            role: USER_ROLES.MANAGER,
            creditBalance: 80
        });

        if (!admin.password.startsWith('$argon2id$') || !profissional.password.startsWith('$argon2id$')) {
            throw new Error('Hashes de senha não estão utilizando Argon2id.');
        }

        const adminPasswordValid = await argon2.verify(admin.password, 'SenhaSegura123');
        const adminPasswordInvalid = await argon2.verify(admin.password, 'SenhaIncorreta');
        const profissionalPasswordValid = await argon2.verify(profissional.password, 'SenhaSegura123');

        if (!adminPasswordValid || adminPasswordInvalid || !profissionalPasswordValid) {
            throw new Error('Algumas validações de hash Argon2 falharam.');
        }

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
                targetRoles: [USER_ROLES.ADMIN]
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

        await runNotificationBadgeE2E();

        console.log('Health check executado com sucesso.');
    } catch (error) {
        console.error('Falha no health-check:', error);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
}

run();
