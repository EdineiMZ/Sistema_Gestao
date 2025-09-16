process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const request = require('supertest');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');

jest.mock('../../src/middlewares/authMiddleware', () => jest.fn((req, res, next) => {
    req.session = req.session || {};
    req.user = { id: 1, active: true, role: 'admin' };
    req.session.user = req.user;
    next();
}));

jest.mock('../../src/middlewares/permissionMiddleware', () => () => (req, res, next) => next());

jest.mock('../../src/middlewares/audit', () => () => (req, res, next) => next());

jest.mock('pdfkit', () => {
    return class PDFDocumentMock {
        constructor() {
            this.stream = null;
        }

        pipe(stream) {
            this.stream = stream;
            return stream;
        }

        fontSize() {
            return this;
        }

        text() {
            return this;
        }

        moveDown() {
            return this;
        }

        fillColor() {
            return this;
        }

        end() {
            if (this.stream) {
                if (typeof this.stream.write === 'function') {
                    this.stream.write('PDF');
                }
                if (typeof this.stream.end === 'function') {
                    this.stream.end();
                }
            }
        }
    };
});

jest.mock('exceljs', () => {
    class WorksheetMock {
        constructor() {
            this.columns = [];
            this.rows = [];
        }

        addRow(data) {
            this.rows.push(data);
            return data;
        }
    }

    class WorkbookMock {
        constructor() {
            this.creator = null;
            this.created = null;
            this.worksheets = [];
            this.xlsx = {
                write: jest.fn(async (stream) => {
                    if (typeof stream.write === 'function') {
                        stream.write('Excel');
                    }
                    if (typeof stream.end === 'function') {
                        stream.end();
                    }
                })
            };
        }

        addWorksheet() {
            const sheet = new WorksheetMock();
            this.worksheets.push(sheet);
            return sheet;
        }
    }

    return { Workbook: WorkbookMock };
});

const financeRoutes = require('../../src/routes/financeRoutes');
const financeReportingService = require('../../src/services/financeReportingService');
const { FinanceEntry, sequelize } = require('../../database/models');

const buildTestApp = () => {
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    app.use(session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false
    }));
    app.use(flash());
    app.use('/finance', financeRoutes);
    return app;
};

describe('FinanceController export endpoints', () => {
    const sampleEntries = [
        {
            id: 1,
            description: 'Conta de Luz',
            type: 'payable',
            status: 'pending',
            value: '100',
            dueDate: '2024-01-10'
        },
        {
            id: 2,
            description: 'Serviço Prestado',
            type: 'receivable',
            status: 'paid',
            value: '250',
            dueDate: '2024-01-12'
        }
    ];

    const summaryResponse = {
        statusSummary: {
            payable: { pending: 100, paid: 0, overdue: 0, cancelled: 0 },
            receivable: { pending: 0, paid: 250, overdue: 0, cancelled: 0 }
        },
        monthlySummary: [
            { month: '2024-01', payable: 100, receivable: 250 }
        ],
        totals: {
            payable: 100,
            receivable: 250,
            net: 150,
            overdue: 0,
            paid: 250,
            pending: 100
        }
    };

    let app;
    let findAllSpy;
    let summarySpy;

    beforeEach(() => {
        jest.clearAllMocks();
        app = buildTestApp();
        findAllSpy = jest.spyOn(FinanceEntry, 'findAll').mockResolvedValue(sampleEntries);
        summarySpy = jest.spyOn(financeReportingService, 'getFinanceSummary').mockResolvedValue(summaryResponse);
    });

    afterEach(() => {
        findAllSpy.mockRestore();
        summarySpy.mockRestore();
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('retorna um PDF com os lançamentos filtrados', async () => {
        const response = await request(app)
            .get('/finance/export/pdf?startDate=2024-01-01&endDate=2024-01-31')
            .buffer()
            .parse((res, callback) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                res.on('end', () => callback(null, Buffer.concat(chunks)));
            });

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('application/pdf');
        expect(response.headers['content-disposition']).toMatch(/\.pdf"?$/i);
        expect(Buffer.isBuffer(response.body)).toBe(true);
        expect(response.body.length).toBeGreaterThan(0);
        expect(FinanceEntry.findAll).toHaveBeenCalledWith(expect.objectContaining({
            order: expect.any(Array),
            where: expect.objectContaining({
                dueDate: expect.objectContaining({})
            })
        }));
        expect(financeReportingService.getFinanceSummary).toHaveBeenCalledWith(
            { startDate: '2024-01-01', endDate: '2024-01-31' },
            expect.objectContaining({ entries: sampleEntries })
        );
    });

    it('retorna um Excel com os lançamentos filtrados', async () => {
        const response = await request(app)
            .get('/finance/export/excel?startDate=2024-02-01&endDate=2024-02-28')
            .buffer()
            .parse((res, callback) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                res.on('end', () => callback(null, Buffer.concat(chunks)));
            });

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        expect(response.headers['content-disposition']).toMatch(/\.xlsx"?$/i);
        expect(Buffer.isBuffer(response.body)).toBe(true);
        expect(response.body.length).toBeGreaterThan(0);
        expect(FinanceEntry.findAll).toHaveBeenCalledWith(expect.objectContaining({
            order: expect.any(Array),
            where: expect.objectContaining({
                dueDate: expect.objectContaining({})
            })
        }));
        expect(financeReportingService.getFinanceSummary).toHaveBeenCalledWith(
            { startDate: '2024-02-01', endDate: '2024-02-28' },
            expect.objectContaining({ entries: sampleEntries })
        );
    });
});
