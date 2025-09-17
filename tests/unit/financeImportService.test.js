const financeImportService = require('../../src/services/financeImportService');

describe('financeImportService', () => {
    describe('parseFinanceFile - CSV', () => {
        it('normaliza valores, datas e metadados a partir de um CSV válido', () => {
            const csvContent = [
                'Descrição;Valor;Data;Tipo;Status',
                'Conta de Luz;-150,30;10/01/2024;Despesa;pending',
                'Mensalidade Academia;2500;2024-01-15;Receita;paid'
            ].join('\n');

            const buffer = Buffer.from(csvContent, 'utf8');
            const result = financeImportService.parseFinanceFile(buffer, {
                filename: 'lancamentos.csv',
                mimetype: 'text/csv'
            });

            expect(result.entries).toHaveLength(2);
            expect(result.warnings).toHaveLength(0);

            const [firstEntry, secondEntry] = result.entries;

            expect(firstEntry).toMatchObject({
                description: 'Conta de Luz',
                type: 'payable',
                value: 150.3,
                dueDate: '2024-01-10',
                status: 'pending',
                metadata: expect.objectContaining({
                    source: 'csv',
                    line: 2,
                    originalType: 'Despesa'
                })
            });

            expect(secondEntry).toMatchObject({
                description: 'Mensalidade Academia',
                type: 'receivable',
                value: 2500,
                dueDate: '2024-01-15',
                status: 'paid',
                metadata: expect.objectContaining({
                    source: 'csv',
                    line: 3,
                    originalType: 'Receita'
                })
            });
        });
    });

    describe('parseFinanceFile - OFX', () => {
        it('interpreta lançamentos a partir de um arquivo OFX', () => {
            const ofxContent = `
<OFX>
    <BANKTRANLIST>
        <STMTTRN>
            <TRNTYPE>DEBIT
            <DTPOSTED>20240105120000[-03:EST]
            <TRNAMT>-89.45
            <MEMO>Supermercado Central
        </STMTTRN>
        <STMTTRN>
            <TRNTYPE>CREDIT
            <DTPOSTED>20240106
            <TRNAMT>1500.00
            <NAME>Pagamento Projeto
        </STMTTRN>
    </BANKTRANLIST>
</OFX>
`.trim();

            const buffer = Buffer.from(ofxContent, 'utf8');
            const result = financeImportService.parseFinanceFile(buffer, {
                filename: 'extrato.ofx',
                mimetype: 'application/ofx'
            });

            expect(result.entries).toHaveLength(2);

            const [debitEntry, creditEntry] = result.entries;
            expect(debitEntry).toMatchObject({
                description: 'Supermercado Central',
                type: 'payable',
                value: 89.45,
                dueDate: '2024-01-05'
            });

            expect(creditEntry).toMatchObject({
                description: 'Pagamento Projeto',
                type: 'receivable',
                value: 1500,
                dueDate: '2024-01-06'
            });
        });
    });

    describe('prepareEntryForPersistence', () => {
        it('padroniza descrição, valores, datas e hash de um lançamento', () => {
            const prepared = financeImportService.prepareEntryForPersistence({
                description: '  Serviço de Consultoria  ',
                value: '1.234,56',
                dueDate: '12/02/2024',
                status: 'paid',
                type: 'receita'
            });

            expect(prepared).toMatchObject({
                description: 'Serviço de Consultoria',
                type: 'receivable',
                value: 1234.56,
                dueDate: '2024-02-12',
                status: 'paid',
                paymentDate: null
            });

            expect(typeof prepared.hash).toBe('string');
            expect(prepared.hash).toHaveLength(64);
        });
    });

    describe('createEntryHash', () => {
        it('gera o mesmo hash para dados equivalentes', () => {
            const hashA = financeImportService.createEntryHash({
                description: 'Mensalidade',
                value: '150,00',
                dueDate: '2024-01-10'
            });

            const hashB = financeImportService.createEntryHash({
                description: '  mensalidade  ',
                value: 150,
                dueDate: '10/01/2024'
            });

            expect(hashA).toBe(hashB);
        });
    });
});
