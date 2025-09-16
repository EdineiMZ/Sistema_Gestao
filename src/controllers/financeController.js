const { FinanceEntry } = require('../../database/models');
// p/ gerar PDF
// const PDFKit = require('pdfkit');
// p/ gerar Excel
// const ExcelJS = require('exceljs');

module.exports = {
    listFinanceEntries: async (req, res) => {
        try {
            const entries = await FinanceEntry.findAll();
            res.render('finance/manageFinance', { entries });
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

    // Exemplo de exportar em PDF (implementação ilustrativa)
    exportPDF: async (req, res) => {
        try {
            // Lógica para gerar PDF com pdfkit ou outra lib
            // ...
            res.send('PDF gerado (exemplo).');
        } catch(err) {
            console.error(err);
            res.status(500).send('Erro ao exportar PDF');
        }
    },

    // Exemplo de exportar em Excel (implementação ilustrativa)
    exportExcel: async (req, res) => {
        try {
            // Lógica com ExcelJS
            // ...
            res.send('Excel gerado (exemplo).');
        } catch(err) {
            console.error(err);
            res.status(500).send('Erro ao exportar Excel');
        }
    }
};
