process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const request = require('supertest');

const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-attachments-'));
process.env.FINANCE_STORAGE_PATH = storageRoot;

jest.mock('../../src/middlewares/authMiddleware', () => jest.fn((req, res, next) => {
    req.session = req.session || {};
    req.user = { id: 1, role: 'admin', active: true };
    req.session.user = req.user;
    next();
}));

jest.mock('../../src/middlewares/permissionMiddleware', () => () => (req, res, next) => next());

jest.mock('../../src/middlewares/audit', () => () => (req, res, next) => next());

const financeRoutes = require('../../src/routes/financeRoutes');
const fileStorageService = require('../../src/services/fileStorageService');
const { FinanceEntry, FinanceAttachment, sequelize } = require('../../database/models');

const buildApp = () => {
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    app.use(session({
        secret: 'finance-test-secret',
        resave: false,
        saveUninitialized: false
    }));
    app.use(flash());
    app.use('/finance', financeRoutes);
    return app;
};

describe('FinanceController attachments', () => {
    let app;

    beforeEach(async () => {
        await sequelize.sync({ force: true });
        await fsp.rm(storageRoot, { recursive: true, force: true });
        await fsp.mkdir(storageRoot, { recursive: true });
        app = buildApp();
    });

    afterAll(async () => {
        await sequelize.close();
        await fsp.rm(storageRoot, { recursive: true, force: true });
    });

    it('permite enviar anexos ao criar um lançamento financeiro', async () => {
        const pdfBuffer = Buffer.from('%PDF-1.4\n%FinanceAttachmentTest');

        const response = await request(app)
            .post('/finance/create')
            .field('description', 'Pagamento fornecedor tecnologia')
            .field('type', 'payable')
            .field('value', '1250.55')
            .field('dueDate', '2024-09-30')
            .field('recurring', 'false')
            .field('recurringInterval', '')
            .attach('attachments', pdfBuffer, { filename: 'Notas   fiscais.pdf', contentType: 'application/pdf' });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/finance');

        const entry = await FinanceEntry.findOne({
            include: [{ model: FinanceAttachment, as: 'attachments' }]
        });

        expect(entry).toBeTruthy();
        expect(entry.attachments).toHaveLength(1);

        const [attachment] = entry.attachments;
        expect(attachment.fileName).toBe('Notas-fiscais.pdf');
        expect(attachment.mimeType).toBe('application/pdf');
        expect(Number(attachment.size)).toBe(pdfBuffer.length);

        const storedContent = await fsp.readFile(fileStorageService.resolveStoragePath(attachment.storageKey));
        expect(storedContent.equals(pdfBuffer)).toBe(true);
    });

    it('permite realizar download autenticado dos anexos cadastrados', async () => {
        const entry = await FinanceEntry.create({
            description: 'Serviço de consultoria',
            type: 'receivable',
            value: '2200.00',
            dueDate: '2024-10-15',
            recurring: false,
            recurringInterval: null
        });

        const noteBuffer = Buffer.from('Relatorio financeiro confidencial');
        const { storageKey, checksum, sanitizedFileName } = await fileStorageService.saveBuffer({
            buffer: noteBuffer,
            originalName: 'relatorio.txt'
        });

        const attachment = await FinanceAttachment.create({
            financeEntryId: entry.id,
            fileName: sanitizedFileName,
            mimeType: 'text/plain',
            size: noteBuffer.length,
            checksum,
            storageKey
        });

        const response = await request(app)
            .get(`/finance/attachments/${attachment.id}/download`)
            .buffer(true)
            .parse((res, callback) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                res.on('end', () => callback(null, Buffer.concat(chunks)));
            });

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/plain');
        expect(response.headers['content-disposition']).toContain('relatorio.txt');
        expect(Buffer.isBuffer(response.body)).toBe(true);
        expect(response.body.equals(noteBuffer)).toBe(true);
    });
});
