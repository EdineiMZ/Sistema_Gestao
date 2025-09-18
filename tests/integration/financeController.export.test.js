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

jest.mock('../../src/services/investmentSimulationService', () => ({
    simulateInvestmentProjections: jest.fn()
}));

jest.mock('pdfkit', () => {
    const instances = [];

    class PDFDocumentMock {
        constructor() {
            this.stream = null;
            this.page = {
                width: 595.28,
                margins: {
                    left: 40,
                    right: 40
                }
            };
            this.fontSize = jest.fn(() => this);
            this.text = jest.fn(() => this);
            this.moveDown = jest.fn(() => this);
            this.fillColor = jest.fn(() => this);
            this.image = jest.fn(() => this);
            instances.push(this);
        }

        pipe(stream) {
            this.stream = stream;
            return stream;
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
    }

    PDFDocumentMock.__mockInstances = instances;

    return PDFDocumentMock;
});

jest.mock('exceljs', () => {
    const workbookInstances = [];

    class WorksheetMock {
        constructor(name) {
            this.name = name;
            this.columns = [];
            this.rows = [];
            this.images = [];
            this._cells = new Map();
            this._rowCells = new Map();
            this._rowConfigs = new Map();
            this.mergeCells = jest.fn();
            this.addImage = jest.fn((imageId, rangeOrOptions) => {
                this.images.push({ imageId, rangeOrOptions });
                return rangeOrOptions;
            });
        }

        addRow(data) {
            const rowNumber = this.rows.length + 1;
            this.rows.push(data);
            const cellMap = new Map();
            this._rowCells.set(rowNumber, cellMap);

            return {
                number: rowNumber,
                values: data,
                getCell: (key) => {
                    if (!cellMap.has(key)) {
                        cellMap.set(key, {});
                    }
                    return cellMap.get(key);
                }
            };
        }

        get rowCount() {
            return this.rows.length;
        }

        getCell(address) {
            if (!this._cells.has(address)) {
                this._cells.set(address, {
                    value: undefined,
                    alignment: undefined,
                    font: undefined
                });
            }
            return this._cells.get(address);
        }

        getRow(index) {
            if (!this._rowConfigs.has(index)) {
                this._rowConfigs.set(index, { font: undefined, alignment: undefined });
            }
            return this._rowConfigs.get(index);
        }
    }

    class WorkbookMock {
        constructor() {
            this.creator = null;
            this.created = null;
            this.worksheets = [];
            this.images = [];
            this.addImage = jest.fn((options) => {
                const id = this.images.length + 1;
                this.images.push({ id, options });
                return id;
            });
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
            workbookInstances.push(this);
        }

        addWorksheet(name) {
            const sheet = new WorksheetMock(name);
            this.worksheets.push(sheet);
            return sheet;
        }
    }

    WorkbookMock.__mockInstances = workbookInstances;

    return { Workbook: WorkbookMock, __mockInstances: workbookInstances };
});

const chartBuffer = Buffer.from('chart-image');
const chartImageMock = {
    buffer: chartBuffer,
    width: 800,
    height: 400,
    dataUrl: `data:image/png;base64,${chartBuffer.toString('base64')}`
};

jest.mock('../../src/services/reportChartService', () => ({
    generateFinanceReportChart: jest.fn()
}));

const financeRoutes = require('../../src/routes/financeRoutes');
const financeReportingService = require('../../src/services/financeReportingService');
const reportChartService = require('../../src/services/reportChartService');
const investmentSimulationService = require('../../src/services/investmentSimulationService');
const PDFDocumentMock = require('pdfkit');
const ExcelJSMock = require('exceljs');
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
        PDFDocumentMock.__mockInstances.length = 0;
        ExcelJSMock.__mockInstances.length = 0;
        reportChartService.generateFinanceReportChart.mockResolvedValue(chartImageMock);
        investmentSimulationService.simulateInvestmentProjections.mockResolvedValue({
            categories: [
                {
                    categoryId: 1,
                    categoryName: 'Consultorias',
                    principal: 1500,
                    monthlyContribution: 200,
                    periodMonths: 6,
                    rateSource: 'user',
                    simple: { futureValue: 1800, totalContributions: 1200 },
                    compound: { futureValue: 1850 }
                }
            ],
            totals: {
                principal: 1500,
                contributions: 1200,
                simpleFutureValue: 1800,
                compoundFutureValue: 1850,
                interestDelta: 50
            },
            options: { defaultPeriodMonths: 6 },
            generatedAt: new Date().toISOString()
        });
        app = buildTestApp();
        findAllSpy = jest.spyOn(FinanceEntry, 'findAll').mockResolvedValue(sampleEntries);
        summarySpy = jest.spyOn(financeReportingService, 'getFinanceSummary').mockResolvedValue(summaryResponse);
    });

    afterEach(() => {
        findAllSpy.mockRestore();
        summarySpy.mockRestore();
        reportChartService.generateFinanceReportChart.mockReset();
        investmentSimulationService.simulateInvestmentProjections.mockReset();
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
        expect(reportChartService.generateFinanceReportChart).toHaveBeenCalledWith(summaryResponse);
        expect(investmentSimulationService.simulateInvestmentProjections).toHaveBeenCalledWith(expect.objectContaining({
            entries: expect.arrayContaining([expect.objectContaining({ id: 1 })])
        }));

        const pdfInstance = PDFDocumentMock.__mockInstances[0];
        expect(pdfInstance).toBeDefined();
        expect(pdfInstance.image).toHaveBeenCalledWith(
            chartImageMock.buffer,
            expect.objectContaining({
                width: expect.any(Number),
                align: 'center'
            })
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
        expect(reportChartService.generateFinanceReportChart).toHaveBeenCalledWith(summaryResponse, {
            width: 720,
            height: 360
        });
        expect(investmentSimulationService.simulateInvestmentProjections).toHaveBeenCalledWith(expect.objectContaining({
            entries: expect.arrayContaining([expect.objectContaining({ id: 1 })])
        }));

        const workbookInstance = ExcelJSMock.__mockInstances[0];
        expect(workbookInstance).toBeDefined();
        expect(workbookInstance.addImage).toHaveBeenCalledWith(expect.objectContaining({
            buffer: chartImageMock.buffer,
            extension: 'png'
        }));

        const simulationSheet = workbookInstance.worksheets.find((sheet) => sheet.name === 'Simulação');
        expect(simulationSheet).toBeDefined();
        expect(simulationSheet.rows.length).toBeGreaterThan(0);

        const summarySheet = workbookInstance.worksheets[0];
        expect(summarySheet.addImage).toHaveBeenCalledWith(
            expect.any(Number),
            expect.stringMatching(/^A\d+:H\d+$/)
        );
    });
});
