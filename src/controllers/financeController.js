const { FinanceEntry } = require('../../database/models');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const financeReportingService = require('../services/financeReportingService');

const { utils: reportingUtils } = financeReportingService;

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

const buildFiltersFromQuery = (query = {}) => {
    const filters = {};

    if (reportingUtils.isValidISODate(query.startDate)) {
        filters.startDate = query.startDate;
    }

    if (reportingUtils.isValidISODate(query.endDate)) {
        filters.endDate = query.endDate;
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

    const dateFilter = reportingUtils.buildDateFilter(filters);
    if (dateFilter) {
        options.where = { dueDate: dateFilter };
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
                financeTotals: summary.totals
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
                recurringInterval: recurringInterval || null
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
            entry.recurringInterval = recurringInterval || null;

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
