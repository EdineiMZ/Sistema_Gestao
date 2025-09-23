const { Op, fn, col, where } = require('sequelize');
const {
    Sale,
    SaleItem,
    SalePayment,
    Product,
    User,
    sequelize
} = require('../../database/models');
const { SALE_STATUSES, PAYMENT_METHODS, PAYMENT_METHOD_VALUES } = require('../constants/pos');
const { generateReceiptPdf } = require('../services/posReceiptService');

const APP_NAME = process.env.APP_NAME || 'Sistema de Gestão Inteligente';
const COMPANY_NAME = process.env.COMPANY_NAME || APP_NAME;
const COMPANY_TAX_ID = process.env.COMPANY_TAX_ID || '00.000.000/0000-00';
const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || 'Endereço não configurado';
const COMPANY_CITY = process.env.COMPANY_CITY || 'Cidade';
const COMPANY_STATE = process.env.COMPANY_STATE || 'UF';

const includeSaleAssociations = [
    {
        model: SaleItem,
        as: 'items',
        include: [
            {
                model: Product,
                as: 'product'
            }
        ]
    },
    {
        model: SalePayment,
        as: 'payments'
    },
    {
        model: User,
        as: 'operator'
    }
];

const saleOrdering = [
    [{ model: SaleItem, as: 'items' }, 'createdAt', 'ASC'],
    [{ model: SalePayment, as: 'payments' }, 'createdAt', 'ASC']
];

const toCents = (value) => {
    if (value === null || value === undefined) {
        return 0;
    }

    const normalized = typeof value === 'string' ? value.replace(/,/g, '.') : value;
    const numberValue = Number.parseFloat(normalized);
    if (!Number.isFinite(numberValue)) {
        return 0;
    }

    return Math.round(numberValue * 100);
};

const centsToDecimalString = (value) => {
    return (value / 100).toFixed(2);
};

const sumCents = (...values) => {
    return values.reduce((acc, current) => acc + toCents(current), 0);
};

const safeRollback = async (transaction) => {
    if (transaction && !transaction.finished) {
        try {
            await transaction.rollback();
        } catch (rollbackError) {
            console.error('Falha ao desfazer transação do PDV:', rollbackError);
        }
    }
};

const sanitizeSaleResponse = (saleInstance) => {
    const plain = saleInstance.get({ plain: true });

    const normalizeMoney = (value) => Number.parseFloat(value ?? 0);

    plain.totalGross = normalizeMoney(plain.totalGross);
    plain.totalDiscount = normalizeMoney(plain.totalDiscount);
    plain.totalTax = normalizeMoney(plain.totalTax);
    plain.totalNet = normalizeMoney(plain.totalNet);
    plain.totalPaid = normalizeMoney(plain.totalPaid);
    plain.changeDue = normalizeMoney(plain.changeDue);

    plain.items = Array.isArray(plain.items)
        ? plain.items.map((item) => ({
            ...item,
            quantity: Number.parseFloat(item.quantity ?? 0),
            unitPrice: normalizeMoney(item.unitPrice),
            grossTotal: normalizeMoney(item.grossTotal),
            discountValue: normalizeMoney(item.discountValue),
            taxValue: normalizeMoney(item.taxValue),
            netTotal: normalizeMoney(item.netTotal)
        }))
        : [];

    plain.payments = Array.isArray(plain.payments)
        ? plain.payments.map((payment) => ({
            ...payment,
            amount: normalizeMoney(payment.amount)
        }))
        : [];

    return plain;
};

const resolveUserFromRequest = (req) => {
    if (req.user && req.user.id) {
        return req.user;
    }

    if (req.session && req.session.user) {
        return req.session.user;
    }

    return null;
};

const ensureSaleForUser = async ({ saleId, userId, transaction, lock }) => {
    const sale = await Sale.findOne({
        where: {
            id: saleId,
            userId
        },
        include: includeSaleAssociations,
        order: saleOrdering,
        transaction,
        lock
    });

    return sale;
};

const renderPosPage = (req, res) => {
    res.render('pos/index', {
        pageTitle: 'Ponto de Venda Inteligente',
        paymentMethods: PAYMENT_METHODS,
        saleStatuses: SALE_STATUSES
    });
};

const openSale = async (req, res) => {
    const user = resolveUserFromRequest(req);

    if (!user) {
        return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
    }

    try {
        const sale = await Sale.create({
            userId: user.id,
            customerName: req.body.customerName || null,
            customerTaxId: req.body.customerTaxId || null,
            customerEmail: req.body.customerEmail || null,
            notes: req.body.notes || null
        });

        await sale.reload({ include: includeSaleAssociations, order: saleOrdering });

        return res.status(201).json({ sale: sanitizeSaleResponse(sale) });
    } catch (error) {
        console.error('Erro ao abrir venda:', error);
        return res.status(500).json({ message: 'Não foi possível abrir a venda.' });
    }
};

const listProducts = async (req, res) => {
    const term = String(req.query.q || '').trim().toLowerCase();
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 10, 50);

    try {
        const whereClauses = { status: 'active' };

        if (term) {
            const likeTerm = `%${term}%`;
            whereClauses[Op.or] = [
                where(fn('lower', col('name')), {
                    [Op.like]: likeTerm
                }),
                where(fn('lower', col('sku')), {
                    [Op.like]: likeTerm
                })
            ];
        }

        const products = await Product.findAll({
            where: whereClauses,
            limit,
            order: [['name', 'ASC']]
        });

        const formatted = products.map((product) => ({
            id: product.id,
            name: product.name,
            sku: product.sku,
            unit: product.unit,
            unitPrice: Number.parseFloat((product.unitPrice ?? product.price) || 0),
            taxRate: Number.parseFloat(product.taxRate || 0),
            taxCode: product.taxCode || null
        }));

        return res.json({ products: formatted });
    } catch (error) {
        console.error('Erro ao buscar produtos para o PDV:', error);
        return res.status(500).json({ message: 'Não foi possível carregar os produtos.' });
    }
};

const addItem = async (req, res) => {
    const user = resolveUserFromRequest(req);

    if (!user) {
        return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
    }

    const saleId = Number.parseInt(req.params.saleId, 10);
    const { productId, quantity, unitPrice, discountValue, taxValue } = req.body;

    const transaction = await sequelize.transaction();

    try {
        const sale = await ensureSaleForUser({
            saleId,
            userId: user.id,
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!sale) {
            await safeRollback(transaction);
            return res.status(404).json({ message: 'Venda não encontrada.' });
        }

        if (sale.status !== SALE_STATUSES.OPEN && sale.status !== SALE_STATUSES.PENDING_PAYMENT) {
            await safeRollback(transaction);
            return res.status(400).json({ message: 'Apenas vendas em aberto podem receber itens.' });
        }

        const product = await Product.findOne({
            where: { id: productId, status: 'active' },
            transaction,
            lock: transaction.LOCK.SHARE
        });

        if (!product) {
            await safeRollback(transaction);
            return res.status(404).json({ message: 'Produto não encontrado.' });
        }

        const quantityCents = toCents(quantity) / 100;
        if (quantityCents <= 0) {
            await safeRollback(transaction);
            return res.status(422).json({ message: 'Quantidade inválida.' });
        }

        const productBasePrice = (product.unitPrice ?? product.price) || 0;
        const resolvedUnitPrice = unitPrice ? Number.parseFloat(unitPrice) : Number.parseFloat(productBasePrice);
        const gross = quantityCents * resolvedUnitPrice;
        const discount = Number.parseFloat(discountValue || 0);
        const tax = Number.parseFloat(taxValue || 0);
        const net = gross - discount + tax;

        const item = await SaleItem.create({
            saleId: sale.id,
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            unitLabel: product.unit,
            quantity: quantityCents,
            unitPrice: resolvedUnitPrice,
            grossTotal: gross,
            discountValue: discount,
            taxValue: tax,
            netTotal: net,
            metadata: {
                taxCode: product.taxCode || null
            }
        }, { transaction });

        const newTotals = {
            gross: sumCents(sale.totalGross, gross),
            discount: sumCents(sale.totalDiscount, discount),
            tax: sumCents(sale.totalTax, tax),
            net: sumCents(sale.totalNet, net)
        };

        sale.totalGross = centsToDecimalString(newTotals.gross);
        sale.totalDiscount = centsToDecimalString(newTotals.discount);
        sale.totalTax = centsToDecimalString(newTotals.tax);
        sale.totalNet = centsToDecimalString(newTotals.net);

        if (toCents(sale.totalPaid) < newTotals.net) {
            sale.status = SALE_STATUSES.PENDING_PAYMENT;
        }

        await sale.save({ transaction });
        await transaction.commit();

        await sale.reload({ include: includeSaleAssociations, order: saleOrdering });

        return res.status(201).json({
            sale: sanitizeSaleResponse(sale),
            item: item.get({ plain: true })
        });
    } catch (error) {
        await safeRollback(transaction);
        console.error('Erro ao adicionar item à venda:', error);
        return res.status(500).json({ message: 'Não foi possível adicionar o item.' });
    }
};

const addPayment = async (req, res) => {
    const user = resolveUserFromRequest(req);

    if (!user) {
        return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
    }

    const saleId = Number.parseInt(req.params.saleId, 10);
    const { method, amount, transactionReference } = req.body;

    const transaction = await sequelize.transaction();

    try {
        const sale = await ensureSaleForUser({
            saleId,
            userId: user.id,
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!sale) {
            await safeRollback(transaction);
            return res.status(404).json({ message: 'Venda não encontrada.' });
        }

        if (sale.status === SALE_STATUSES.CANCELLED || sale.status === SALE_STATUSES.COMPLETED) {
            await safeRollback(transaction);
            return res.status(400).json({ message: 'Não é possível registrar pagamentos para esta venda.' });
        }

        if (!PAYMENT_METHOD_VALUES.includes(method)) {
            await safeRollback(transaction);
            return res.status(422).json({ message: 'Método de pagamento inválido.' });
        }

        const paymentAmount = Number.parseFloat(amount);
        if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
            await safeRollback(transaction);
            return res.status(422).json({ message: 'Valor do pagamento inválido.' });
        }

        await SalePayment.create({
            saleId: sale.id,
            method,
            amount: paymentAmount,
            transactionReference: transactionReference || null
        }, { transaction });

        const newTotalPaidCents = sumCents(sale.totalPaid, paymentAmount);
        sale.totalPaid = centsToDecimalString(newTotalPaidCents);

        if (newTotalPaidCents >= toCents(sale.totalNet)) {
            sale.status = SALE_STATUSES.OPEN;
        } else {
            sale.status = SALE_STATUSES.PENDING_PAYMENT;
        }

        await sale.save({ transaction });
        await transaction.commit();

        await sale.reload({ include: includeSaleAssociations, order: saleOrdering });

        return res.status(201).json({ sale: sanitizeSaleResponse(sale) });
    } catch (error) {
        await safeRollback(transaction);
        console.error('Erro ao registrar pagamento:', error);
        return res.status(500).json({ message: 'Não foi possível registrar o pagamento.' });
    }
};

const finalizeSale = async (req, res) => {
    const user = resolveUserFromRequest(req);

    if (!user) {
        return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
    }

    const saleId = Number.parseInt(req.params.saleId, 10);

    const transaction = await sequelize.transaction();

    try {
        let sale = await ensureSaleForUser({
            saleId,
            userId: user.id,
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!sale) {
            await safeRollback(transaction);
            return res.status(404).json({ message: 'Venda não encontrada.' });
        }

        if (sale.status === SALE_STATUSES.CANCELLED) {
            await safeRollback(transaction);
            return res.status(400).json({ message: 'Venda cancelada não pode ser finalizada.' });
        }

        if (!sale.items.length) {
            await safeRollback(transaction);
            return res.status(400).json({ message: 'Adicione ao menos um item antes de finalizar a venda.' });
        }

        const totalNetCents = toCents(sale.totalNet);
        const totalPaidCents = toCents(sale.totalPaid);

        if (totalPaidCents < totalNetCents) {
            await safeRollback(transaction);
            return res.status(400).json({ message: 'Pagamento insuficiente para finalizar a venda.' });
        }

        const changeDueCents = totalPaidCents - totalNetCents;
        sale.changeDue = centsToDecimalString(changeDueCents);
        sale.status = SALE_STATUSES.COMPLETED;
        sale.closedAt = new Date();
        sale.qrCodeData = sale.qrCodeData || sale.accessKey;

        if (!sale.receiptNumber) {
            sale.receiptNumber = `RC-${String(sale.id).padStart(6, '0')}`;
        }

        await sale.save({ transaction });
        await transaction.commit();

        sale = await Sale.findByPk(sale.id, { include: includeSaleAssociations, order: saleOrdering });
        const serializedSale = sanitizeSaleResponse(sale);

        const receipt = await generateReceiptPdf({
            sale: serializedSale,
            issuer: {
                name: COMPANY_NAME,
                taxId: COMPANY_TAX_ID,
                address: COMPANY_ADDRESS,
                city: COMPANY_CITY,
                state: COMPANY_STATE
            }
        });

        return res.json({
            sale: serializedSale,
            receipt
        });
    } catch (error) {
        await safeRollback(transaction);
        console.error('Erro ao finalizar venda:', error);
        return res.status(500).json({ message: 'Não foi possível finalizar a venda.' });
    }
};

const getSale = async (req, res) => {
    const user = resolveUserFromRequest(req);

    if (!user) {
        return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
    }

    try {
        const sale = await Sale.findOne({
            where: { id: req.params.saleId, userId: user.id },
            include: includeSaleAssociations,
            order: saleOrdering
        });

        if (!sale) {
            return res.status(404).json({ message: 'Venda não encontrada.' });
        }

        return res.json({ sale: sanitizeSaleResponse(sale) });
    } catch (error) {
        console.error('Erro ao carregar venda:', error);
        return res.status(500).json({ message: 'Não foi possível carregar a venda.' });
    }
};

const downloadReceipt = async (req, res) => {
    const user = resolveUserFromRequest(req);

    if (!user) {
        return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
    }

    try {
        const sale = await Sale.findOne({
            where: { id: req.params.saleId, userId: user.id },
            include: includeSaleAssociations,
            order: saleOrdering
        });

        if (!sale) {
            return res.status(404).json({ message: 'Venda não encontrada.' });
        }

        if (sale.status !== SALE_STATUSES.COMPLETED) {
            return res.status(400).json({ message: 'Apenas vendas finalizadas possuem comprovante.' });
        }

        const serializedSale = sanitizeSaleResponse(sale);
        const receipt = await generateReceiptPdf({
            sale: serializedSale,
            issuer: {
                name: COMPANY_NAME,
                taxId: COMPANY_TAX_ID,
                address: COMPANY_ADDRESS,
                city: COMPANY_CITY,
                state: COMPANY_STATE
            }
        });

        res.setHeader('Content-Type', receipt.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${receipt.fileName}"`);
        return res.send(Buffer.from(receipt.base64, 'base64'));
    } catch (error) {
        console.error('Erro ao emitir recibo:', error);
        return res.status(500).json({ message: 'Não foi possível gerar o comprovante.' });
    }
};

module.exports = {
    renderPosPage,
    openSale,
    listProducts,
    addItem,
    addPayment,
    finalizeSale,
    getSale,
    downloadReceipt
};
