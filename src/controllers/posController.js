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

const REPORT_RANGE_PRESETS = Object.freeze({
    '7d': 7,
    '14d': 14,
    '30d': 30,
    '90d': 90
});

const DEFAULT_REPORT_RANGE = '30d';

const paymentLabelMap = new Map(PAYMENT_METHODS.map((method) => [method.value, method.label]));

const normalizeDecimal = (value) => {
    if (value === null || value === undefined) {
        return 0;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }

    const normalized = String(value).replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

const computeVariation = (current, previous) => {
    if (!Number.isFinite(previous) || previous === 0) {
        return null;
    }

    return ((current - previous) / previous) * 100;
};

const formatDateKey = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return null;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const resolveRange = (rawRange) => {
    const normalized = typeof rawRange === 'string' ? rawRange.trim().toLowerCase() : '';
    const rangeKey = REPORT_RANGE_PRESETS[normalized] ? normalized : DEFAULT_REPORT_RANGE;
    const days = REPORT_RANGE_PRESETS[rangeKey];

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    const previousEnd = new Date(start);
    previousEnd.setMilliseconds(previousEnd.getMilliseconds() - 1);

    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - (days - 1));
    previousStart.setHours(0, 0, 0, 0);

    return {
        preset: rangeKey,
        days,
        start,
        end,
        previousStart,
        previousEnd
    };
};

const renderPosPage = (req, res) => {
    res.render('pos/index', {
        pageTitle: 'Ponto de Venda Inteligente',
        paymentMethods: PAYMENT_METHODS,
        saleStatuses: SALE_STATUSES
    });
};

const renderReportsPage = (req, res) => {
    res.render('pos/reports', {
        pageTitle: 'Relatórios do PDV',
        defaultRange: DEFAULT_REPORT_RANGE,
        paymentMethods: PAYMENT_METHODS,
        rangeOptions: Object.keys(REPORT_RANGE_PRESETS)
    });
};

const buildSaleAggregation = (sales = []) => {
    const summary = {
        gross: 0,
        discounts: 0,
        taxes: 0,
        net: 0,
        paid: 0,
        changeDue: 0
    };

    const trendMap = new Map();

    sales.forEach((sale) => {
        const gross = normalizeDecimal(sale.totalGross);
        const discount = normalizeDecimal(sale.totalDiscount);
        const tax = normalizeDecimal(sale.totalTax);
        const net = normalizeDecimal(sale.totalNet);
        const paid = normalizeDecimal(sale.totalPaid);
        const changeDue = normalizeDecimal(sale.changeDue);

        summary.gross += gross;
        summary.discounts += discount;
        summary.taxes += tax;
        summary.net += net;
        summary.paid += paid;
        summary.changeDue += changeDue;

        const closedAt = sale.closedAt ? new Date(sale.closedAt) : null;
        const dayKey = closedAt ? formatDateKey(closedAt) : null;
        if (dayKey) {
            if (!trendMap.has(dayKey)) {
                trendMap.set(dayKey, {
                    date: dayKey,
                    revenue: 0,
                    orders: 0
                });
            }

            const entry = trendMap.get(dayKey);
            entry.revenue += net;
            entry.orders += 1;
        }
    });

    return {
        summary,
        orders: sales.length,
        trend: Array.from(trendMap.values()).sort((a, b) => (a.date < b.date ? -1 : 1))
    };
};

const getOverviewReport = async (req, res) => {
    const user = resolveUserFromRequest(req);

    if (!user) {
        return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
    }

    const range = resolveRange(req.query.range);
    const saleWhere = {
        status: SALE_STATUSES.COMPLETED,
        closedAt: {
            [Op.between]: [range.start, range.end]
        }
    };

    const previousWhere = {
        status: SALE_STATUSES.COMPLETED,
        closedAt: {
            [Op.between]: [range.previousStart, range.previousEnd]
        }
    };

    try {
        const [currentSales, previousSales, paymentRows] = await Promise.all([
            Sale.findAll({
                where: saleWhere,
                attributes: [
                    'id',
                    'totalGross',
                    'totalDiscount',
                    'totalTax',
                    'totalNet',
                    'totalPaid',
                    'changeDue',
                    'closedAt'
                ],
                order: [['closedAt', 'ASC']],
                raw: true
            }),
            Sale.findAll({
                where: previousWhere,
                attributes: ['id', 'totalGross', 'totalDiscount', 'totalTax', 'totalNet'],
                raw: true
            }),
            SalePayment.findAll({
                include: [
                    {
                        model: Sale,
                        as: 'sale',
                        attributes: [],
                        where: saleWhere,
                        required: true
                    }
                ],
                attributes: [
                    [col('SalePayment.method'), 'method'],
                    [fn('sum', col('SalePayment.amount')), 'totalAmount']
                ],
                group: [col('SalePayment.method')],
                raw: true
            })
        ]);

        const currentAggregation = buildSaleAggregation(currentSales);
        const previousAggregation = buildSaleAggregation(previousSales);

        const averageTicket = currentAggregation.orders
            ? currentAggregation.summary.net / currentAggregation.orders
            : 0;
        const previousAverageTicket = previousAggregation.orders
            ? previousAggregation.summary.net / previousAggregation.orders
            : 0;

        const variations = {
            revenue: computeVariation(currentAggregation.summary.net, previousAggregation.summary.net),
            orders: computeVariation(currentAggregation.orders, previousAggregation.orders),
            averageTicket: computeVariation(averageTicket, previousAverageTicket)
        };

        const trend = currentAggregation.trend;
        const bestDay = trend.reduce((acc, item) => {
            if (!acc || item.revenue > acc.revenue) {
                return item;
            }
            return acc;
        }, null);

        const payments = paymentRows
            .map((row) => {
                const amount = normalizeDecimal(row.totalAmount);
                return {
                    method: row.method,
                    label: paymentLabelMap.get(row.method) || row.method,
                    amount
                };
            })
            .sort((a, b) => b.amount - a.amount);

        const totalPayments = payments.reduce((acc, item) => acc + item.amount, 0);
        const paymentsWithShare = payments.map((item) => ({
            ...item,
            share: totalPayments ? (item.amount / totalPayments) * 100 : 0
        }));

        return res.json({
            range: {
                preset: range.preset,
                start: range.start.toISOString(),
                end: range.end.toISOString()
            },
            generatedAt: new Date().toISOString(),
            totals: {
                orders: currentAggregation.orders,
                gross: currentAggregation.summary.gross,
                discounts: currentAggregation.summary.discounts,
                taxes: currentAggregation.summary.taxes,
                net: currentAggregation.summary.net,
                paid: currentAggregation.summary.paid,
                changeDue: currentAggregation.summary.changeDue,
                averageTicket
            },
            variations,
            trend,
            payments: paymentsWithShare,
            highlights: {
                bestDay
            }
        });
    } catch (error) {
        console.error('Erro ao gerar visão geral de relatórios do PDV:', error);
        return res.status(500).json({ message: 'Não foi possível carregar a visão geral de relatórios.' });
    }
};

const getTopProductsReport = async (req, res) => {
    const user = resolveUserFromRequest(req);

    if (!user) {
        return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
    }

    const range = resolveRange(req.query.range);
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 10, 25);

    const saleWhere = {
        status: SALE_STATUSES.COMPLETED,
        closedAt: {
            [Op.between]: [range.start, range.end]
        }
    };

    try {
        const rows = await SaleItem.findAll({
            where: {
                '$sale.status$': SALE_STATUSES.COMPLETED
            },
            attributes: [
                'productId',
                'productName',
                'sku',
                [fn('sum', col('SaleItem.quantity')), 'totalQuantity'],
                [fn('sum', col('SaleItem.netTotal')), 'totalNet'],
                [fn('sum', col('SaleItem.grossTotal')), 'totalGross'],
                [fn('sum', col('SaleItem.discountValue')), 'totalDiscount']
            ],
            include: [
                {
                    model: Sale,
                    as: 'sale',
                    attributes: [],
                    required: true,
                    where: saleWhere
                },
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'sku'],
                    required: false
                }
            ],
            group: [
                'SaleItem.productId',
                'SaleItem.productName',
                'SaleItem.sku',
                'product.id',
                'product.name',
                'product.sku'
            ],
            order: [[fn('sum', col('SaleItem.netTotal')), 'DESC']],
            limit,
            raw: true
        });

        const items = rows.map((row) => {
            const quantity = normalizeDecimal(row.totalQuantity);
            const net = normalizeDecimal(row.totalNet);
            const gross = normalizeDecimal(row.totalGross);
            const discount = normalizeDecimal(row.totalDiscount);

            return {
                productId: row.productId,
                name: row['product.name'] || row.productName,
                sku: row['product.sku'] || row.sku,
                quantity,
                gross,
                discount,
                revenue: net
            };
        });

        const totalQuantity = items.reduce((acc, item) => acc + item.quantity, 0);
        const totalRevenue = items.reduce((acc, item) => acc + item.revenue, 0);

        const itemsWithShare = items.map((item) => ({
            ...item,
            quantityShare: totalQuantity ? (item.quantity / totalQuantity) * 100 : 0,
            revenueShare: totalRevenue ? (item.revenue / totalRevenue) * 100 : 0
        }));

        return res.json({
            range: {
                preset: range.preset,
                start: range.start.toISOString(),
                end: range.end.toISOString()
            },
            generatedAt: new Date().toISOString(),
            totals: {
                quantity: totalQuantity,
                revenue: totalRevenue
            },
            items: itemsWithShare
        });
    } catch (error) {
        console.error('Erro ao gerar relatório de produtos mais vendidos:', error);
        return res.status(500).json({ message: 'Não foi possível carregar os produtos mais vendidos.' });
    }
};

const getHourlyMovementReport = async (req, res) => {
    const user = resolveUserFromRequest(req);

    if (!user) {
        return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
    }

    const range = resolveRange(req.query.range);
    const saleWhere = {
        status: SALE_STATUSES.COMPLETED,
        closedAt: {
            [Op.between]: [range.start, range.end]
        }
    };

    try {
        const sales = await Sale.findAll({
            where: saleWhere,
            attributes: ['id', 'closedAt', 'totalNet'],
            raw: true
        });

        const hours = Array.from({ length: 24 }, (_, index) => ({
            hour: index,
            label: `${String(index).padStart(2, '0')}:00`,
            revenue: 0,
            orders: 0
        }));

        sales.forEach((sale) => {
            const closedAt = sale.closedAt ? new Date(sale.closedAt) : null;
            if (!closedAt || Number.isNaN(closedAt.getTime())) {
                return;
            }

            const hour = closedAt.getHours();
            const entry = hours[hour];
            entry.orders += 1;
            entry.revenue += normalizeDecimal(sale.totalNet);
        });

        const busiestHour = hours.reduce((acc, item) => {
            if (!acc || item.orders > acc.orders) {
                return item;
            }
            return acc;
        }, null);

        return res.json({
            range: {
                preset: range.preset,
                start: range.start.toISOString(),
                end: range.end.toISOString()
            },
            generatedAt: new Date().toISOString(),
            hours,
            highlights: {
                busiestHour
            }
        });
    } catch (error) {
        console.error('Erro ao gerar relatório horário do PDV:', error);
        return res.status(500).json({ message: 'Não foi possível carregar o movimento por horário.' });
    }
};

const getDailyMovementReport = async (req, res) => {
    const user = resolveUserFromRequest(req);

    if (!user) {
        return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
    }

    const range = resolveRange(req.query.range);
    const saleWhere = {
        status: SALE_STATUSES.COMPLETED,
        closedAt: {
            [Op.between]: [range.start, range.end]
        }
    };

    try {
        const sales = await Sale.findAll({
            where: saleWhere,
            attributes: ['id', 'closedAt', 'totalNet'],
            raw: true
        });

        const daysMap = new Map();
        for (let index = 0; index < range.days; index += 1) {
            const date = new Date(range.start);
            date.setDate(range.start.getDate() + index);
            const key = formatDateKey(date);
            daysMap.set(key, {
                date: key,
                revenue: 0,
                orders: 0
            });
        }

        sales.forEach((sale) => {
            const closedAt = sale.closedAt ? new Date(sale.closedAt) : null;
            const key = closedAt ? formatDateKey(closedAt) : null;
            if (!key || !daysMap.has(key)) {
                return;
            }

            const entry = daysMap.get(key);
            entry.revenue += normalizeDecimal(sale.totalNet);
            entry.orders += 1;
        });

        const days = Array.from(daysMap.values());
        const bestDay = days.reduce((acc, item) => {
            if (!acc || item.revenue > acc.revenue) {
                return item;
            }
            return acc;
        }, null);

        return res.json({
            range: {
                preset: range.preset,
                start: range.start.toISOString(),
                end: range.end.toISOString()
            },
            generatedAt: new Date().toISOString(),
            days,
            highlights: {
                bestDay
            }
        });
    } catch (error) {
        console.error('Erro ao gerar relatório diário do PDV:', error);
        return res.status(500).json({ message: 'Não foi possível carregar o movimento por dia.' });
    }
};

const getStockSnapshot = async (req, res) => {
    const user = resolveUserFromRequest(req);

    if (!user) {
        return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
    }

    try {
        const [totalActive, outOfStock, lowStockCount, stockItems] = await Promise.all([
            Product.count({ where: { status: 'active' } }),
            Product.count({ where: { status: 'active', stockStatus: 'out-of-stock' } }),
            Product.count({
                where: {
                    status: 'active',
                    [Op.and]: [sequelize.where(col('stockQuantity'), '<=', fn('coalesce', col('lowStockThreshold'), 10))]
                }
            }),
            Product.findAll({
                where: { status: 'active' },
                attributes: [
                    'id',
                    'name',
                    'sku',
                    'stockQuantity',
                    'stockStatus',
                    'lowStockThreshold',
                    'allowBackorder'
                ],
                order: [['stockQuantity', 'ASC']],
                limit: Math.min(Number.parseInt(req.query.limit, 10) || 12, 30)
            })
        ]);

        const adequateStock = Math.max(totalActive - outOfStock - lowStockCount, 0);

        const items = stockItems.map((product) => {
            const stockQuantity = Number.parseInt(product.stockQuantity, 10) || 0;
            const lowThreshold = product.lowStockThreshold !== null ? Number(product.lowStockThreshold) : null;
            const isCritical =
                product.stockStatus === 'out-of-stock' ||
                (lowThreshold !== null && stockQuantity <= lowThreshold);

            return {
                id: product.id,
                name: product.name,
                sku: product.sku,
                stockQuantity,
                lowStockThreshold: lowThreshold,
                stockStatus: product.stockStatus,
                allowBackorder: Boolean(product.allowBackorder),
                isCritical
            };
        });

        return res.json({
            generatedAt: new Date().toISOString(),
            summary: {
                totalActive,
                outOfStock,
                lowStock: lowStockCount,
                adequateStock
            },
            items
        });
    } catch (error) {
        console.error('Erro ao gerar relatório de estoque do PDV:', error);
        return res.status(500).json({ message: 'Não foi possível carregar o retrato do estoque.' });
    }
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

        const formatted = products.map((product) => {
            const normalizedUnitPrice =
                product.unitPrice !== undefined && product.unitPrice !== null
                    ? product.unitPrice
                    : product.price;

            return {
                id: product.id,
                name: product.name,
                sku: product.sku,
                unit: product.unit || 'un',
                unitPrice: Number.parseFloat(normalizedUnitPrice || 0),
                taxRate: Number.parseFloat(product.taxRate || 0),
                taxCode: product.taxCode || null
            };
        });

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

        const resolvedUnitPrice = unitPrice ? Number.parseFloat(unitPrice) : Number.parseFloat(product.unitPrice || 0);
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
    renderReportsPage,
    getOverviewReport,
    getTopProductsReport,
    getHourlyMovementReport,
    getDailyMovementReport,
    getStockSnapshot,
    openSale,
    listProducts,
    addItem,
    addPayment,
    finalizeSale,
    getSale,
    downloadReceipt
};
