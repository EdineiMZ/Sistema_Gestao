const financeImportService = require('../../src/services/financeImportService');

describe('financeImportService', () => {
    describe('parseFinanceFile - CSV', () => {
        it('normaliza valores, datas, categoria e metadados a partir de um CSV válido', () => {
            const csvContent = [
                'Descrição;Valor;Data;Tipo;Status;Categoria',
                'Conta de Luz;-150,30;10/01/2024;Despesa;pending;Despesas Fixas',
                'Mensalidade Academia;2500;2024-01-15;Receita;paid;Receitas Diversas'
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
                financeCategorySlug: 'despesas-fixas',
                metadata: expect.objectContaining({
                    source: 'csv',
                    line: 2,
                    originalType: 'Despesa',
                    originalCategory: 'Despesas Fixas',
                    categorySlug: 'despesas-fixas'
                })
            });

            expect(secondEntry).toMatchObject({
                description: 'Mensalidade Academia',
                type: 'receivable',
                value: 2500,
                dueDate: '2024-01-15',
                status: 'paid',
                financeCategorySlug: 'receitas-diversas',
                metadata: expect.objectContaining({
                    source: 'csv',
                    line: 3,
                    originalType: 'Receita',
                    originalCategory: 'Receitas Diversas',
                    categorySlug: 'receitas-diversas'
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
            <CATEGORY>Alimentação
        </STMTTRN>
        <STMTTRN>
            <TRNTYPE>CREDIT
            <DTPOSTED>20240106
            <TRNAMT>1500.00
            <NAME>Pagamento Projeto
            <CATEGORY>Receitas
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
                dueDate: '2024-01-05',
                financeCategorySlug: 'alimentacao',
                metadata: expect.objectContaining({
                    originalCategory: 'Alimentação',
                    categorySlug: 'alimentacao'
                })
            });

            expect(creditEntry).toMatchObject({
                description: 'Pagamento Projeto',
                type: 'receivable',
                value: 1500,
                dueDate: '2024-01-06',
                financeCategorySlug: 'receitas',
                metadata: expect.objectContaining({
                    originalCategory: 'Receitas',
                    categorySlug: 'receitas'
                })
            });
        });
    });

    describe('prepareEntryForPersistence', () => {
        it('padroniza descrição, valores, datas, categoria e hash de um lançamento', async () => {
            const resolver = {
                resolveSlug: async () => 42,
                isAllowedId: () => true
            };

            const prepared = await financeImportService.prepareEntryForPersistence({
                description: '  Serviço de Consultoria  ',
                value: '1.234,56',
                dueDate: '12/02/2024',
                status: 'paid',
                type: 'receita',
                financeCategorySlug: 'consultoria'
            }, { categoryResolver: resolver });

            expect(prepared).toMatchObject({
                description: 'Serviço de Consultoria',
                type: 'receivable',
                value: 1234.56,
                dueDate: '2024-02-12',
                status: 'paid',
                paymentDate: null,
                financeCategoryId: 42
            });

            expect(typeof prepared.hash).toBe('string');
            expect(prepared.hash).toHaveLength(64);
        });

        it('rejeita categoria que não pertence ao usuário autenticado', async () => {
            const resolver = {
                resolveSlug: async () => null,
                isAllowedId: () => false
            };

            await expect(
                financeImportService.prepareEntryForPersistence({
                    description: 'Conta de Luz',
                    value: '250,00',
                    dueDate: '2024-01-10',
                    type: 'despesa',
                    financeCategorySlug: 'categoria-invalida'
                }, { categoryResolver: resolver })
            ).rejects.toThrow('Categoria informada não encontrada para o usuário autenticado.');
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
