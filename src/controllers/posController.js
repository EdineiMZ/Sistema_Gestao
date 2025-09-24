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
const {
    getReports: getPosReportsService,
    getTopProducts: getTopProductsService,
    getTrafficReport: getTrafficReportService,
    getInventoryReport: getInventoryReportService,
    buildLimit: buildReportLimit,
    resolveRange: resolveReportRange,
    MAX_LIMIT: REPORT_MAX_LIMIT,
    MAX_RANGE_DAYS: REPORT_MAX_RANGE_DAYS,
    DEFAULT_RANGE_DAYS: REPORT_DEFAULT_RANGE_DAYS,
    DEFAULT_INVENTORY_LIMIT,
    MAX_INVENTORY_LIMIT
} = require('../services/posReportingService');

const APP_NAME = process.env.APP_NAME || 'Sistema de Gestão Inteligente';
const COMPANY_NAME = process.env.COMPANY_NAME || APP_NAME;
const COMPANY_TAX_ID = process.env.COMPANY_TAX_ID || '00.000.000/0000-00';
const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || 'Endereço não configurado';
const COMPANY_CITY = process.env.COMPANY_CITY || 'Cidade';
const COMPANY_STATE = process.env.COMPANY_STATE || 'UF';
const DEFAULT_POS_UNIT_LABEL = process.env.POS_DEFAULT_UNIT_LABEL || 'CX';
const DEFAULT_POS_FISCAL_CODE = process.env.POS_DEFAULT_FISCAL_CODE || '3304.99.90';

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

const normalizeDecimal = (value, precision = 2) => {
    if (value === null || value === undefined) {
        return Number((0).toFixed(precision));
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? Number(value.toFixed(precision)) : Number((0).toFixed(precision));
    }

    const normalized = String(value).trim().replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed)) {
        return Number((0).toFixed(precision));
    }

    return Number(parsed.toFixed(precision));
};

const normalizeQuantity = (value) => {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
        return 0;
    }
    return Number(parsed.toFixed(3));
};

const normalizeInteger = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeWeekdayIndex = (value) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return 0;
    }
    if (parsed >= 0 && parsed <= 6) {
        return parsed;
    }
    if (parsed >= 1 && parsed <= 7) {
        return parsed % 7;
    }
    return 0;
};

const toIsoStringSafe = (value) => {
    if (!value) {
        return null;
    }
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return date.toISOString();
};

const normalizePeriod = (period) => {
    if (!period) {
        return null;
    }
    const start = toIsoStringSafe(period.start);
    const end = toIsoStringSafe(period.end);
    if (!start || !end) {
        return null;
    }
    return { start, end };
};

const parseDateParam = (value, { endOfDay = false } = {}) => {
    if (!value) {
        return null;
    }
    const trimmed = String(value).trim();
    if (!trimmed) {
        return null;
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        if (endOfDay) {
            parsed.setHours(23, 59, 59, 999);
        } else {
            parsed.setHours(0, 0, 0, 0);
        }
    }

    return parsed;
};

const resolveReportParameters = (query = {}) => {
    const startRaw = typeof query.startDate === 'string' ? query.startDate.trim() : '';
    const endRaw = typeof query.endDate === 'string' ? query.endDate.trim() : '';

    const startDate = startRaw ? parseDateParam(startRaw) : null;
    if (startRaw && !startDate) {
        return { error: 'Data inicial inválida.' };
    }

    const endDate = endRaw ? parseDateParam(endRaw, { endOfDay: true }) : null;
    if (endRaw && !endDate) {
        return { error: 'Data final inválida.' };
    }

    let range;

    try {
        range = resolveReportRange({
            start: startDate || undefined,
            end: endDate || undefined
        });
    } catch (rangeError) {
        return { error: rangeError.message || 'Período inválido.' };
    }

    const limit = buildReportLimit(query.limit);
    const inventoryLimit = buildReportLimit(query.inventoryLimit, {
        defaultValue: DEFAULT_INVENTORY_LIMIT,
        maxValue: MAX_INVENTORY_LIMIT
    });

    return {
        range,
        limit,
        inventoryLimit
    };
};

const normalizeTopProductsReport = (report) => {
    if (!report) {
        return {
            period: null,
            limit: 0,
            byQuantity: [],
            byRevenue: []
        };
    }

    const toEntry = (entry) => ({
        productId: entry.productId ?? null,
        name: entry.name || 'Produto',
        sku: entry.sku || null,
        totalQuantity: normalizeQuantity(entry.totalQuantity ?? 0),
        totalRevenue: normalizeDecimal(entry.totalRevenue ?? 0),
        totalGross: normalizeDecimal(entry.totalGross ?? 0),
        totalDiscount: normalizeDecimal(entry.totalDiscount ?? 0),
        averageTicket: normalizeDecimal(entry.averageTicket ?? 0)
    });

    return {
        period: normalizePeriod(report.period),
        limit: normalizeInteger(report.limit),
        byQuantity: Array.isArray(report.byQuantity) ? report.byQuantity.map(toEntry) : [],
        byRevenue: Array.isArray(report.byRevenue) ? report.byRevenue.map(toEntry) : []
    };
};

const normalizeTrafficReport = (report) => {
    if (!report) {
        return {
            period: null,
            totals: { salesCount: 0, totalRevenue: 0 },
            byHour: [],
            byWeekday: [],
            byDay: []
        };
    }

    const parseSalesCount = (value) => {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    return {
        period: normalizePeriod(report.period),
        totals: {
            salesCount: parseSalesCount(report.totals?.salesCount),
            totalRevenue: normalizeDecimal(report.totals?.totalRevenue ?? 0)
        },
        byHour: Array.isArray(report.byHour)
            ? report.byHour.map((entry) => ({
                hour: entry.hour || null,
                salesCount: parseSalesCount(entry.salesCount),
                totalRevenue: normalizeDecimal(entry.totalRevenue ?? 0)
            }))
            : [],
        byWeekday: Array.isArray(report.byWeekday)
            ? report.byWeekday.map((entry) => ({
                weekday: normalizeWeekdayIndex(entry.weekday),
                salesCount: parseSalesCount(entry.salesCount),
                totalRevenue: normalizeDecimal(entry.totalRevenue ?? 0)
            }))
            : [],
        byDay: Array.isArray(report.byDay)
            ? report.byDay.map((entry) => ({
                day: entry.day || null,
                salesCount: parseSalesCount(entry.salesCount),
                totalRevenue: normalizeDecimal(entry.totalRevenue ?? 0)
            }))
            : []
    };
};

const normalizeInventoryReport = (report) => {
    if (!report) {
        return {
            limit: 0,
            items: [],
            lowStockAlerts: []
        };
    }

    const parseOptionalInteger = (value) => {
        if (value === null || value === undefined) {
            return null;
        }
        const parsed = Number.parseInt(value, 10);
        return Number.isInteger(parsed) ? parsed : null;
    };

    return {
        limit: normalizeInteger(report.limit),
        items: Array.isArray(report.items)
            ? report.items.map((item) => ({
                productId: item.productId,
                name: item.name,
                sku: item.sku,
                stockQuantity: normalizeInteger(item.stockQuantity),
                lowStockThreshold: parseOptionalInteger(item.lowStockThreshold),
                maxStockThreshold: parseOptionalInteger(item.maxStockThreshold),
                stockStatus: item.stockStatus,
                unitPrice: normalizeDecimal(item.unitPrice ?? 0),
                lowStock: Boolean(item.lowStock)
            }))
            : [],
        lowStockAlerts: Array.isArray(report.lowStockAlerts)
            ? report.lowStockAlerts.map((alert) => ({
                productId: alert.productId,
                name: alert.name,
                stockQuantity: normalizeInteger(alert.stockQuantity),
                lowStockThreshold: parseOptionalInteger(alert.lowStockThreshold)
            }))
            : []
    };
};

const getPosReports = async (req, res) => {
    const params = resolveReportParameters(req.query);
    if (params.error) {
        return res.status(400).json({ message: params.error });
    }

    try {
        const reports = await getPosReportsService({
            start: params.range.start,
            end: params.range.end,
            limit: params.limit,
            inventoryLimit: params.inventoryLimit
        });

        return res.json({
            metadata: {
                maxLimit: REPORT_MAX_LIMIT,
                maxRangeDays: REPORT_MAX_RANGE_DAYS,
                defaultRangeDays: REPORT_DEFAULT_RANGE_DAYS
            },
            topProducts: normalizeTopProductsReport(reports.topProducts),
            traffic: normalizeTrafficReport(reports.traffic),
            inventory: normalizeInventoryReport(reports.inventory)
        });
    } catch (error) {
        console.error('Erro ao gerar relatórios do PDV:', error);
        return res.status(500).json({ message: 'Não foi possível gerar os relatórios do PDV.' });
    }
};

const getTopProductsReport = async (req, res) => {
    const params = resolveReportParameters(req.query);
    if (params.error) {
        return res.status(400).json({ message: params.error });
    }

    try {
        const report = await getTopProductsService({
            start: params.range.start,
            end: params.range.end,
            limit: params.limit
        });

        const normalizedReport = normalizeTopProductsReport(report);
        const revenueEntries = normalizedReport.byRevenue;
        const totals = revenueEntries.reduce(
            (acc, entry) => {
                acc.quantity += entry.totalQuantity;
                acc.revenue += entry.totalRevenue;
                return acc;
            },
            { quantity: 0, revenue: 0 }
        );

        const items = revenueEntries.map((entry) => ({
            productId: entry.productId,
            name: entry.name,
            sku: entry.sku,
            quantity: entry.totalQuantity,
            gross: entry.totalGross,
            discount: entry.totalDiscount,
            revenue: entry.totalRevenue,
            quantityShare: totals.quantity ? (entry.totalQuantity / totals.quantity) * 100 : 0,
            revenueShare: totals.revenue ? (entry.totalRevenue / totals.revenue) * 100 : 0
        }));

        return res.json({
            metadata: {
                maxLimit: REPORT_MAX_LIMIT,
                maxRangeDays: REPORT_MAX_RANGE_DAYS,
                defaultRangeDays: REPORT_DEFAULT_RANGE_DAYS
            },
            report: normalizedReport,
            range: normalizedReport.period || {
                start: params.range.start.toISOString(),
                end: params.range.end.toISOString()
            },
            generatedAt: new Date().toISOString(),
            totals: {
                quantity: totals.quantity,
                revenue: totals.revenue
            },
            items
        });
    } catch (error) {
        console.error('Erro ao gerar ranking de produtos do PDV:', error);
        return res.status(500).json({ message: 'Não foi possível gerar o ranking de produtos.' });
    }
};

const getTrafficReport = async (req, res) => {
    const params = resolveReportParameters(req.query);
    if (params.error) {
        return res.status(400).json({ message: params.error });
    }

    try {
        const report = await getTrafficReportService({
            start: params.range.start,
            end: params.range.end
        });

        return res.json({
            metadata: {
                maxRangeDays: REPORT_MAX_RANGE_DAYS,
                defaultRangeDays: REPORT_DEFAULT_RANGE_DAYS
            },
            report: normalizeTrafficReport(report)
        });
    } catch (error) {
        console.error('Erro ao gerar relatório de fluxo do PDV:', error);
        return res.status(500).json({ message: 'Não foi possível gerar o relatório de fluxo.' });
    }
};

const getInventoryReport = async (req, res) => {
    const params = resolveReportParameters(req.query);
    if (params.error) {
        return res.status(400).json({ message: params.error });
    }

    try {
        const report = await getInventoryReportService({
            limit: params.inventoryLimit
        });

        return res.json({
            metadata: {
                maxLimit: MAX_INVENTORY_LIMIT,
                defaultLimit: DEFAULT_INVENTORY_LIMIT
            },
            report: normalizeInventoryReport(report)
        });
    } catch (error) {
        console.error('Erro ao gerar relatório de estoque do PDV:', error);
        return res.status(500).json({ message: 'Não foi possível gerar o relatório de estoque.' });
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

            const rawUnit = typeof product.unit === 'string' ? product.unit.trim() : null;
            const normalizedUnit = rawUnit ? rawUnit.toUpperCase() : null;
            const unit = normalizedUnit && normalizedUnit !== 'UN' ? normalizedUnit : DEFAULT_POS_UNIT_LABEL;

            return {
                id: product.id,
                name: product.name,
                sku: product.sku,
                unit,
                unitPrice: Number.parseFloat(normalizedUnitPrice || 0),
                taxRate: Number.parseFloat(product.taxRate || 0),
                fiscalCode: product.ncmCode || DEFAULT_POS_FISCAL_CODE,
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

        const productWhere = { id: productId };

        if (Product.rawAttributes && Object.prototype.hasOwnProperty.call(Product.rawAttributes, 'active')) {
            productWhere.active = true;
        }

        if (Product.rawAttributes && Object.prototype.hasOwnProperty.call(Product.rawAttributes, 'status')) {
            productWhere.status = 'active';
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

        const resolvedUnitPrice = unitPrice
            ? Number.parseFloat(unitPrice)
            : Number.parseFloat(product.unitPrice ?? product.price ?? 0);
        const gross = quantityCents * resolvedUnitPrice;
        const discount = Number.parseFloat(discountValue || 0);
        const tax = Number.parseFloat(taxValue || 0);
        const net = gross - discount + tax;

        const item = await SaleItem.create({
            saleId: sale.id,
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            unitLabel: product.unit || 'UN',
            quantity: quantityCents,
            unitPrice: resolvedUnitPrice,
            grossTotal: gross,
            discountValue: discount,
            taxValue: tax,
            netTotal: net,
            metadata: {
                fiscalCode: product.ncmCode || product.taxCode || null
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

        const totalNetCents = toCents(sale.totalNet);
        const newTotalPaidCents = sumCents(sale.totalPaid, paymentAmount);
        sale.totalPaid = centsToDecimalString(newTotalPaidCents);

        if (newTotalPaidCents >= totalNetCents) {
            sale.status = SALE_STATUSES.OPEN;
            const changeDueCents = newTotalPaidCents - totalNetCents;
            sale.changeDue = centsToDecimalString(changeDueCents);
        } else {
            sale.status = SALE_STATUSES.PENDING_PAYMENT;
            sale.changeDue = centsToDecimalString(0);
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
    downloadReceipt,
    getPosReports,
    getTrafficReport,
    getInventoryReport
};
