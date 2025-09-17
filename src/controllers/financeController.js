const { FinanceEntry } = require('../../database/models');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const financeReportingService = require('../services/financeReportingService');
const reportChartService = require('../services/reportChartService');
const {
    FINANCE_RECURRING_INTERVALS,
    normalizeRecurringInterval
} = require('../constants/financeRecurringIntervals');

const { utils: reportingUtils, constants: financeConstants } = financeReportingService;
const { FINANCE_TYPES, FINANCE_STATUSES } = financeConstants;

const recurringIntervalOptions = FINANCE_RECURRING_INTERVALS.map((interval) => ({
    value: interval.value,
    label: interval.label
}));

const parseAmount = (value) => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
});

const formatCurrency = (value) => currencyFormatter.format(parseAmount(value));

const sanitizeText = (value) => {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value).replace(/\s+/g, ' ').trim();
};

const formatDateLabel = (value) => {
    if (!value) {
        return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) {
        return null;
    }
    return date.toLocaleDateString('pt-BR');
};

const formatPeriodLabel = (filters = {}) => {
    const start = formatDateLabel(filters.startDate);
    const end = formatDateLabel(filters.endDate);

    if (start && end) {
        return `${start} a ${end}`;
    }
    if (start) {
        return `A partir de ${start}`;
    }
    if (end) {
        return `Até ${end}`;
    }
    return 'Todo o período';
};

const normalizeFilterValue = (value) => {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed.toLowerCase() : null;
};

const buildFiltersFromQuery = (query = {}) => {
    const filters = {};

    if (reportingUtils.isValidISODate(query.startDate)) {
        filters.startDate = query.startDate;
    }

    if (reportingUtils.isValidISODate(query.endDate)) {
        filters.endDate = query.endDate;
    }

    const typeFilter = normalizeFilterValue(query.type);
    if (typeFilter && FINANCE_TYPES.includes(typeFilter)) {
        filters.type = typeFilter;
    }

    const statusFilter = normalizeFilterValue(query.status);
    if (statusFilter && FINANCE_STATUSES.includes(statusFilter)) {
        filters.status = statusFilter;
    }

    return filters;
};

const buildEntriesQueryOptions = (filters = {}) => {
    const options = {
        order: [
            ['dueDate', 'ASC'],
            ['id', 'ASC']
        ]
    };

    const where = {};

    const dateFilter = reportingUtils.buildDateFilter(filters);
    if (dateFilter) {
        where.dueDate = dateFilter;
    }

    if (filters.type && FINANCE_TYPES.includes(filters.type)) {
        where.type = filters.type;
    }

    if (filters.status && FINANCE_STATUSES.includes(filters.status)) {
        where.status = filters.status;
    }

    if (Object.keys(where).length > 0) {
        options.where = where;
    }

    return options;
};

const createSummaryPromise = (entriesPromise, filters) => {
    return entriesPromise.then(entries =>
        financeReportingService.getFinanceSummary(filters, { entries })
    );
};

module.exports = {
    listFinanceEntries: async (req, res) => {
        try {
            const filters = buildFiltersFromQuery(req.query);
            const entriesPromise = FinanceEntry.findAll(buildEntriesQueryOptions(filters));
            const summaryPromise = createSummaryPromise(entriesPromise, filters);

            const [entries, summary] = await Promise.all([entriesPromise, summaryPromise]);

            res.render('finance/manageFinance', {
                entries,
                filters,
                periodLabel: formatPeriodLabel(filters),
                statusSummary: summary.statusSummary,
                monthlySummary: summary.monthlySummary,
                financeTotals: summary.totals,
                recurringIntervalOptions
            });
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao listar finanças.');
            res.redirect('/');
        }
    },

    createFinanceEntry: async (req, res) => {
        try {
            const { description, type, value, dueDate, recurring, recurringInterval } = req.body;
            await FinanceEntry.create({
                description,
                type,
                value,
                dueDate,
                recurring: (recurring === 'true'),
                recurringInterval: normalizeRecurringInterval(recurringInterval)
            });
            req.flash('success_msg', 'Lançamento criado com sucesso!');
            res.redirect('/finance');
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao criar lançamento.');
            res.redirect('/finance');
        }
    },

    updateFinanceEntry: async (req, res) => {
        try {
            const { id } = req.params;
            const { description, type, value, dueDate, paymentDate, status, recurring, recurringInterval } = req.body;

            const entry = await FinanceEntry.findByPk(id);
            if (!entry) {
                req.flash('error_msg', 'Lançamento não encontrado.');
                return res.redirect('/finance');
            }

            entry.description = description;
            entry.type = type;
            entry.value = value;
            entry.dueDate = dueDate;
            entry.paymentDate = paymentDate || null;
            entry.status = status;
            entry.recurring = (recurring === 'true');
            entry.recurringInterval = normalizeRecurringInterval(recurringInterval);

            await entry.save();
            req.flash('success_msg', 'Lançamento atualizado!');
            res.redirect('/finance');
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao atualizar lançamento.');
            res.redirect('/finance');
        }
    },

    deleteFinanceEntry: async (req, res) => {
        try {
            const { id } = req.params;
            const entry = await FinanceEntry.findByPk(id);
            if (!entry) {
                req.flash('error_msg', 'Lançamento não encontrado.');
                return res.redirect('/finance');
            }
            await entry.destroy();
            req.flash('success_msg', 'Lançamento removido com sucesso.');
            res.redirect('/finance');
        } catch (err) {
            console.error(err);
            req.flash('error_msg', 'Erro ao excluir lançamento.');
            res.redirect('/finance');
        }
    },

    exportPdf: async (req, res) => {
        try {
            const filters = buildFiltersFromQuery(req.query);
            const entries = await FinanceEntry.findAll(buildEntriesQueryOptions(filters));
            const summary = await financeReportingService.getFinanceSummary(filters, { entries });
            const chartImage = await reportChartService.generateFinanceReportChart(summary);

            const document = new PDFDocument({
                margin: 40,
                size: 'A4',
                info: {
                    Title: 'Relatório Financeiro'
                }
            });

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="relatorio-financeiro-${Date.now()}.pdf"`
            );

            document.pipe(res);

            document.fontSize(20).text('Relatório Financeiro', { align: 'center' });
            document.moveDown();

            document.fontSize(12).fillColor('#333333').text(`Período: ${formatPeriodLabel(filters)}`);
            document.moveDown();

            document.fontSize(12);
            document.text(`Total a Receber: ${formatCurrency(summary.totals.receivable)}`);
            document.text(`Total a Pagar: ${formatCurrency(summary.totals.payable)}`);
            document.text(`Saldo Projetado: ${formatCurrency(summary.totals.net)}`);
            document.text(`Pagamentos em Atraso: ${formatCurrency(summary.totals.overdue)}`);
            document.moveDown();

            if (chartImage?.buffer instanceof Buffer) {
                const availableWidth = document.page.width - document.page.margins.left - document.page.margins.right;
                const imageWidth = Math.min(availableWidth, chartImage.width || availableWidth);

                document.fontSize(14).fillColor('#000000').text('Resumo Visual', { underline: true });
                document.moveDown(0.5);
                document.image(chartImage.buffer, {
                    width: imageWidth,
                    align: 'center'
                });
                document.moveDown(0.35);
                document.fontSize(10).fillColor('#555555').text(
                    'Figura 1 - Comparativo mensal de valores a pagar e a receber.',
                    { align: 'center' }
                );
                document.moveDown();
            }

            document.fontSize(14).fillColor('#000000').text('Lançamentos', { underline: true });
            document.moveDown(0.5);

            if (!entries.length) {
                document.fontSize(11).text('Nenhum lançamento encontrado para o período selecionado.');
            } else {
                document.fontSize(11).text('Descrição | Tipo | Valor | Vencimento | Status');
                document.moveDown(0.3);
                document.fontSize(10);

                entries.forEach((entry) => {
                    const line = [
                        sanitizeText(entry.description),
                        entry.type === 'payable' ? 'Pagar' : 'Receber',
                        formatCurrency(entry.value),
                        formatDateLabel(entry.dueDate) || '—',
                        sanitizeText(entry.status || 'pendente')
                    ].join(' | ');
                    document.text(line);
                });
            }

            document.end();
        } catch (err) {
            console.error('Erro ao exportar PDF:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Erro ao exportar PDF.' });
            } else {
                res.end();
            }
        }
    },

    exportExcel: async (req, res) => {
        try {
            const filters = buildFiltersFromQuery(req.query);
            const entries = await FinanceEntry.findAll(buildEntriesQueryOptions(filters));
            const summary = await financeReportingService.getFinanceSummary(filters, { entries });
            const chartImage = await reportChartService.generateFinanceReportChart(summary, {
                width: 720,
                height: 360
            });

            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Sistema de Gestão';
            workbook.created = new Date();

            const summarySheet = workbook.addWorksheet('Resumo');
            summarySheet.addRow(['Relatório Financeiro']);
            summarySheet.addRow([`Período: ${formatPeriodLabel(filters)}`]);
            summarySheet.addRow(['Total a Receber', parseAmount(summary.totals.receivable)]);
            summarySheet.addRow(['Total a Pagar', parseAmount(summary.totals.payable)]);
            summarySheet.addRow(['Saldo Projetado', parseAmount(summary.totals.net)]);
            summarySheet.addRow(['Pagamentos em Atraso', parseAmount(summary.totals.overdue)]);
            summarySheet.addRow(['Pagamentos Pendentes', parseAmount(summary.totals.pending)]);
            summarySheet.addRow(['Pagamentos Concluídos', parseAmount(summary.totals.paid)]);

            if (chartImage?.buffer instanceof Buffer) {
                const imageId = workbook.addImage({
                    buffer: chartImage.buffer,
                    extension: 'png'
                });

                const startRow = summarySheet.rowCount + 2;
                const endRow = startRow + 12;
                const endColumn = 'H';

                while (summarySheet.rowCount < endRow) {
                    summarySheet.addRow([]);
                }

                summarySheet.addImage(imageId, `A${startRow}:${endColumn}${endRow}`);

                const captionRow = endRow + 1;
                while (summarySheet.rowCount < captionRow) {
                    summarySheet.addRow([]);
                }

                summarySheet.mergeCells(`A${captionRow}:${endColumn}${captionRow}`);
                const captionCell = summarySheet.getCell(`A${captionRow}`);
                captionCell.value = 'Figura 1: Comparativo mensal de valores a pagar e a receber';
                captionCell.alignment = { horizontal: 'center' };
                captionCell.font = {
                    italic: true,
                    color: { argb: 'FF6B7280' }
                };
            }

            const worksheet = workbook.addWorksheet('Lançamentos');
            worksheet.columns = [
                { header: 'Descrição', key: 'description', width: 40 },
                { header: 'Tipo', key: 'type', width: 15 },
                { header: 'Valor (R$)', key: 'value', width: 18 },
                { header: 'Vencimento', key: 'dueDate', width: 18 },
                { header: 'Status', key: 'status', width: 18 }
            ];

            if (!entries.length) {
                worksheet.addRow({
                    description: 'Nenhum lançamento para o período selecionado',
                    type: '',
                    value: '',
                    dueDate: '',
                    status: ''
                });
            } else {
                entries.forEach((entry) => {
                    worksheet.addRow({
                        description: sanitizeText(entry.description),
                        type: entry.type === 'payable' ? 'Pagar' : 'Receber',
                        value: parseAmount(entry.value),
                        dueDate: formatDateLabel(entry.dueDate) || '',
                        status: sanitizeText(entry.status || 'pendente')
                    });
                });
            }

            res.setHeader(
                'Content-Type',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="relatorio-financeiro-${Date.now()}.xlsx"`
            );

            await workbook.xlsx.write(res);
            res.end();
        } catch (err) {
            console.error('Erro ao exportar Excel:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Erro ao exportar Excel.' });
            } else {
                res.end();
            }
        }
    }
};
