const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const formatCurrency = (value) => {
    const numericValue = Number.parseFloat(value ?? 0);
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(Number.isFinite(numericValue) ? numericValue : 0);
};

const formatDateTime = (value) => {
    const date = value ? new Date(value) : new Date();
    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'medium'
    }).format(date);
};

const collectPdfBuffer = (doc) => new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
});

const drawSectionTitle = (doc, label) => {
    doc.moveDown(0.6);
    doc.fontSize(11).fillColor('#1f2937').text(label);
    const lineStartX = doc.page.margins.left;
    const lineEndX = doc.page.width - doc.page.margins.right;
    const lineY = doc.y + 2;
    doc.moveTo(lineStartX, lineY).lineTo(lineEndX, lineY).lineWidth(0.5).stroke('#e5e7eb');
    doc.moveDown(0.25);
};

const drawKeyValue = (doc, label, value) => {
    doc.fontSize(10).fillColor('#111827').text(`${label}: ${value}`);
};

const drawItemsTable = (doc, items) => {
    const startY = doc.y;
    const columnWidths = [60, 210, 70, 80, 80];
    const headers = ['Qtd.', 'Descrição', 'Unitário', 'Descontos', 'Total'];

    doc.fontSize(10).fillColor('#374151');

    headers.forEach((header, index) => {
        doc.text(header, doc.x + columnWidths.slice(0, index).reduce((acc, width) => acc + width, 0), startY, {
            width: columnWidths[index],
            align: index === 1 ? 'left' : 'right'
        });
    });

    doc.moveDown(0.6);
    const separatorStartX = doc.x;
    doc.lineWidth(0.5).moveTo(separatorStartX, doc.y).lineTo(separatorStartX + columnWidths.reduce((acc, width) => acc + width, 0), doc.y).stroke('#d1d5db');

    doc.moveDown(0.2);

    items.forEach((item) => {
        const rowY = doc.y + 2;
        const values = [
            `${item.quantity.toLocaleString('pt-BR')} ${item.unitLabel || 'un'}`,
            `${item.productName}${item.sku ? ` (${item.sku})` : ''}`,
            formatCurrency(item.unitPrice),
            formatCurrency(item.discountValue),
            formatCurrency(item.netTotal)
        ];

        values.forEach((value, index) => {
            doc.text(value, separatorStartX + columnWidths.slice(0, index).reduce((acc, width) => acc + width, 0), rowY, {
                width: columnWidths[index],
                align: index === 1 ? 'left' : 'right'
            });
        });

        doc.moveDown(0.6);
    });

    doc.moveDown(0.3);
};

const drawPayments = (doc, payments) => {
    payments.forEach((payment) => {
        const paidAt = payment.paidAt ? formatDateTime(payment.paidAt) : '-';
        doc.fontSize(10).fillColor('#111827').text(`• ${payment.method.toUpperCase()} - ${formatCurrency(payment.amount)} (${paidAt})`);
        if (payment.transactionReference) {
            doc.fontSize(9).fillColor('#4b5563').text(`  Ref.: ${payment.transactionReference}`);
        }
    });
};

const generateReceiptPdf = async ({ sale, issuer }) => {
    if (!sale) {
        throw new Error('Venda é obrigatória para gerar recibo.');
    }

    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const pdfPromise = collectPdfBuffer(doc);

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#111827');
    doc.text(issuer?.name || 'Emitente não configurado', { align: 'center' });

    doc.font('Helvetica').fontSize(10).fillColor('#374151');
    doc.text(`Documento fiscal gerado em ${formatDateTime(sale.closedAt || sale.openedAt)}`, { align: 'center' });
    doc.moveDown(1);

    drawSectionTitle(doc, 'Dados do emitente');
    drawKeyValue(doc, 'Razão social', issuer?.name || 'Não informado');
    drawKeyValue(doc, 'Documento', issuer?.taxId || '-');
    drawKeyValue(doc, 'Endereço', issuer?.address || '-');
    drawKeyValue(doc, 'Cidade/UF', issuer ? `${issuer.city || '-'} / ${issuer.state || '-'}` : '-');

    drawSectionTitle(doc, 'Identificação da venda');
    drawKeyValue(doc, 'Número do recibo', sale.receiptNumber || '-');
    drawKeyValue(doc, 'Chave de acesso', sale.accessKey || '-');
    drawKeyValue(doc, 'Operador', sale.operator ? sale.operator.name : 'Não identificado');
    drawKeyValue(doc, 'Status', (sale.status || '').toString().toUpperCase());

    drawSectionTitle(doc, 'Cliente');
    drawKeyValue(doc, 'Nome', sale.customerName || 'Consumidor final');
    drawKeyValue(doc, 'Documento', sale.customerTaxId || '-');
    drawKeyValue(doc, 'E-mail', sale.customerEmail || '-');

    if (sale.notes) {
        doc.moveDown(0.5);
        doc.fontSize(9).fillColor('#4b5563').text(`Observações: ${sale.notes}`);
    }

    if (Array.isArray(sale.items) && sale.items.length) {
        drawSectionTitle(doc, 'Itens da venda');
        drawItemsTable(doc, sale.items);
    }

    drawSectionTitle(doc, 'Totais e tributos');
    drawKeyValue(doc, 'Subtotal', formatCurrency(sale.totalGross));
    drawKeyValue(doc, 'Descontos', formatCurrency(sale.totalDiscount));
    drawKeyValue(doc, 'Tributos', formatCurrency(sale.totalTax));
    drawKeyValue(doc, 'Total líquido', formatCurrency(sale.totalNet));
    drawKeyValue(doc, 'Total pago', formatCurrency(sale.totalPaid));
    drawKeyValue(doc, 'Troco', formatCurrency(sale.changeDue));

    if (Array.isArray(sale.payments) && sale.payments.length) {
        drawSectionTitle(doc, 'Pagamentos registrados');
        drawPayments(doc, sale.payments);
    }

    const qrCodePayload = sale.qrCodeData || sale.accessKey || String(sale.id);

    if (qrCodePayload) {
        const qrDataUrl = await QRCode.toDataURL(qrCodePayload, {
            errorCorrectionLevel: 'M',
            margin: 1,
            scale: 4
        });
        const base64 = qrDataUrl.split(',')[1];
        const qrBuffer = Buffer.from(base64, 'base64');
        const qrX = doc.page.width - doc.page.margins.right - 140;
        const qrY = doc.y + 10;
        doc.image(qrBuffer, qrX, qrY, { fit: [120, 120] });

        doc.moveDown(8);
        drawKeyValue(doc, 'Verificação QR Code', 'Escaneie para validar a autenticidade.');
    }

    doc.moveDown(1);
    doc.fontSize(8).fillColor('#6b7280').text(
        'Documento emitido eletronicamente. Consulte a legislação vigente para validade fiscal.',
        { align: 'center' }
    );

    doc.end();

    const buffer = await pdfPromise;
    const fileName = `cupom-fiscal-${sale.accessKey || sale.receiptNumber || sale.id}.pdf`;

    return {
        fileName,
        mimeType: 'application/pdf',
        base64: buffer.toString('base64')
    };
};

module.exports = {
    generateReceiptPdf
};
