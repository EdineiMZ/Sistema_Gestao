'use strict';

const { Op, fn, col } = require('sequelize');
const { Sale, SaleItem, Product } = require('../../database/models');

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const DEFAULT_INVENTORY_LIMIT = 50;
const MAX_INVENTORY_LIMIT = 200;

const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 180;

const getSequelizeInstance = () => {
    if (Sale?.sequelize) {
        return Sale.sequelize;
    }
    if (SaleItem?.sequelize) {
        return SaleItem.sequelize;
    }
    if (Product?.sequelize) {
        return Product.sequelize;
    }
    return null;
};

const getDialect = () => {
    const sequelizeInstance = getSequelizeInstance();
    if (sequelizeInstance && typeof sequelizeInstance.getDialect === 'function') {
        return sequelizeInstance.getDialect();
    }
    return 'sqlite';
};

const toNumber = (value) => {
    if (value === null || value === undefined) {
        return 0;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const toInteger = (value, fallback = 0) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed)) {
        return fallback;
    }
    return parsed;
};

const clamp = (value, minValue, maxValue) => {
    return Math.min(Math.max(value, minValue), maxValue);
};

const buildLimit = (value, { defaultValue = DEFAULT_LIMIT, maxValue = MAX_LIMIT } = {}) => {
    const parsed = toInteger(value, defaultValue);
    const normalized = clamp(parsed, 1, maxValue);
    return normalized;
};

const resolveRange = ({ start, end } = {}) => {
    const now = new Date();
    const endDate = end ? new Date(end) : now;
    if (Number.isNaN(endDate.getTime())) {
        throw new Error('Data final inválida.');
    }

    const startDate = start ? new Date(start) : new Date(endDate.getTime() - DEFAULT_RANGE_DAYS * 86400000);
    if (Number.isNaN(startDate.getTime())) {
        throw new Error('Data inicial inválida.');
    }

    if (startDate > endDate) {
        throw new Error('Data inicial não pode ser posterior à final.');
    }

    const minimumStart = new Date(endDate.getTime() - MAX_RANGE_DAYS * 86400000);
    const normalizedStart = startDate < minimumStart ? minimumStart : startDate;

    return {
        start: normalizedStart,
        end: endDate
    };
};

const buildSaleDateWhere = ({ start, end }) => {
    const conditions = [];

    if (start) {
        conditions.push({
            [Op.or]: [
                { closedAt: { [Op.gte]: start } },
                {
                    [Op.and]: [
                        { closedAt: null },
                        { openedAt: { [Op.gte]: start } }
                    ]
                }
            ]
        });
    }

    if (end) {
        conditions.push({
            [Op.or]: [
                { closedAt: { [Op.lte]: end } },
                {
                    [Op.and]: [
                        { closedAt: null },
                        { openedAt: { [Op.lte]: end } }
                    ]
                }
            ]
        });
    }

    if (!conditions.length) {
        return {};
    }

    if (conditions.length === 1) {
        return conditions[0];
    }

    return {
        [Op.and]: conditions
    };
};

const getTopProducts = async ({
    limit,
    start,
    end
} = {}) => {
    const { start: rangeStart, end: rangeEnd } = resolveRange({ start, end });
    const normalizedLimit = buildLimit(limit);

    const saleDateWhere = buildSaleDateWhere({ start: rangeStart, end: rangeEnd });

    const rows = await SaleItem.findAll({
        attributes: [
            'productId',
            [col('SaleItem.productName'), 'itemProductName'],
            [col('SaleItem.sku'), 'itemSku'],
            [fn('SUM', col('SaleItem.quantity')), 'totalQuantity'],
            [fn('SUM', col('SaleItem.netTotal')), 'totalNet'],
            [fn('SUM', col('SaleItem.grossTotal')), 'totalGross'],
            [fn('SUM', col('SaleItem.discountValue')), 'totalDiscount']
        ],
        include: [
            {
                model: Sale,
                as: 'sale',
                attributes: [],
                required: true,
                where: {
                    status: 'completed',
                    ...saleDateWhere
                }
            },
            {
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'sku', 'price', 'stockQuantity', 'lowStockThreshold'],
                required: false
            }
        ],
        group: [
            'SaleItem.productId',
            'SaleItem.productName',
            'SaleItem.sku',
            'product.id'
        ],
        raw: true,
        nest: true
    });

    const normalizedRows = rows
        .map((row) => {
            const quantity = toNumber(row.totalQuantity);
            const revenue = toNumber(row.totalNet);
            const gross = toNumber(row.totalGross);
            const discount = toNumber(row.totalDiscount);

            const productId = row.product?.id ?? row.productId ?? null;
            const sku = row.product?.sku || row.itemSku || null;
            const name = row.product?.name || row.itemProductName || 'Produto sem nome';

            return {
                productId,
                name,
                sku,
                totalQuantity: quantity,
                totalRevenue: revenue,
                totalGross: gross,
                totalDiscount: discount,
                averageTicket: quantity > 0 ? Number((revenue / quantity).toFixed(2)) : 0
            };
        })
        .sort((a, b) => b.totalQuantity - a.totalQuantity);

    const topByQuantity = normalizedRows.slice(0, normalizedLimit);
    const topByRevenue = [...normalizedRows]
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, normalizedLimit);

    return {
        period: {
            start: rangeStart,
            end: rangeEnd
        },
        limit: normalizedLimit,
        byQuantity: topByQuantity,
        byRevenue: topByRevenue
    };
};

const buildTimestampExpression = () => {
    const timestamp = fn('COALESCE', col('Sale.closedAt'), col('Sale.openedAt'));
    return timestamp;
};

const buildHourExpression = (timestampExpression, dialect) => {
    if (dialect === 'postgres') {
        return fn('to_char', timestampExpression, 'HH24');
    }
    if (dialect === 'mysql' || dialect === 'mariadb') {
        return fn('DATE_FORMAT', timestampExpression, '%H');
    }
    return fn('strftime', '%H', timestampExpression);
};

const buildWeekdayExpression = (timestampExpression, dialect) => {
    if (dialect === 'postgres') {
        return fn('to_char', timestampExpression, 'ID');
    }
    if (dialect === 'mysql' || dialect === 'mariadb') {
        return fn('DATE_FORMAT', timestampExpression, '%w');
    }
    return fn('strftime', '%w', timestampExpression);
};

const buildDayExpression = (timestampExpression, dialect) => {
    if (dialect === 'postgres') {
        return fn('to_char', timestampExpression, 'YYYY-MM-DD');
    }
    if (dialect === 'mysql' || dialect === 'mariadb') {
        return fn('DATE_FORMAT', timestampExpression, '%Y-%m-%d');
    }
    return fn('strftime', '%Y-%m-%d', timestampExpression);
};

const getTrafficReport = async ({
    start,
    end
} = {}) => {
    const { start: rangeStart, end: rangeEnd } = resolveRange({ start, end });
    const saleDateWhere = buildSaleDateWhere({ start: rangeStart, end: rangeEnd });

    const timestampExpression = buildTimestampExpression();
    const dialect = getDialect();
    const hourExpression = buildHourExpression(timestampExpression, dialect);
    const weekdayExpression = buildWeekdayExpression(timestampExpression, dialect);
    const dayExpression = buildDayExpression(timestampExpression, dialect);

    const baseWhere = {
        status: 'completed',
        ...saleDateWhere
    };

    const [hourlyRows, weekdayRows, dailyRows] = await Promise.all([
        Sale.findAll({
            attributes: [
                [hourExpression, 'hour'],
                [fn('COUNT', col('Sale.id')), 'salesCount'],
                [fn('SUM', col('Sale.totalNet')), 'totalRevenue']
            ],
            where: baseWhere,
            group: [hourExpression],
            raw: true
        }),
        Sale.findAll({
            attributes: [
                [weekdayExpression, 'weekday'],
                [fn('COUNT', col('Sale.id')), 'salesCount'],
                [fn('SUM', col('Sale.totalNet')), 'totalRevenue']
            ],
            where: baseWhere,
            group: [weekdayExpression],
            raw: true
        }),
        Sale.findAll({
            attributes: [
                [dayExpression, 'day'],
                [fn('COUNT', col('Sale.id')), 'salesCount'],
                [fn('SUM', col('Sale.totalNet')), 'totalRevenue']
            ],
            where: baseWhere,
            group: [dayExpression],
            raw: true
        })
    ]);

    const totalSales = weekdayRows.reduce((acc, row) => acc + toNumber(row.salesCount), 0);
    const totalRevenue = weekdayRows.reduce((acc, row) => acc + toNumber(row.totalRevenue), 0);

    const normalizedHourly = hourlyRows
        .map((row) => ({
            hour: row.hour ? `${row.hour}:00` : null,
            salesCount: toNumber(row.salesCount),
            totalRevenue: Number(toNumber(row.totalRevenue).toFixed(2))
        }))
        .sort((a, b) => {
            if (a.hour === null) return 1;
            if (b.hour === null) return -1;
            return a.hour.localeCompare(b.hour);
        });

    const normalizedWeekday = weekdayRows
        .map((row) => ({
            weekday: row.weekday ? Number.parseInt(row.weekday, 10) : 0,
            salesCount: toNumber(row.salesCount),
            totalRevenue: Number(toNumber(row.totalRevenue).toFixed(2))
        }))
        .sort((a, b) => a.weekday - b.weekday);

    const normalizedDaily = dailyRows
        .map((row) => ({
            day: row.day || null,
            salesCount: toNumber(row.salesCount),
            totalRevenue: Number(toNumber(row.totalRevenue).toFixed(2))
        }))
        .sort((a, b) => {
            if (!a.day) return 1;
            if (!b.day) return -1;
            return a.day.localeCompare(b.day);
        });

    return {
        period: {
            start: rangeStart,
            end: rangeEnd
        },
        totals: {
            salesCount: totalSales,
            totalRevenue: Number(totalRevenue.toFixed(2))
        },
        byHour: normalizedHourly,
        byWeekday: normalizedWeekday,
        byDay: normalizedDaily
    };
};

const getInventoryReport = async ({ limit } = {}) => {
    const normalizedLimit = buildLimit(limit, {
        defaultValue: DEFAULT_INVENTORY_LIMIT,
        maxValue: MAX_INVENTORY_LIMIT
    });

    const products = await Product.findAll({
        attributes: [
            'id',
            'name',
            'sku',
            'stockQuantity',
            'lowStockThreshold',
            'maxStockThreshold',
            'stockStatus',
            'price'
        ],
        where: {
            status: 'active'
        },
        order: [
            ['stockQuantity', 'ASC'],
            ['name', 'ASC']
        ],
        limit: normalizedLimit
    });

    const items = products.map((product) => {
        const stockQuantity = toInteger(product.stockQuantity, 0);
        const lowStockThreshold = product.lowStockThreshold !== null && product.lowStockThreshold !== undefined
            ? toInteger(product.lowStockThreshold, null)
            : null;
        const maxStockThreshold = product.maxStockThreshold !== null && product.maxStockThreshold !== undefined
            ? toInteger(product.maxStockThreshold, null)
            : null;

        const isLowStock = lowStockThreshold !== null && stockQuantity <= lowStockThreshold;
        const isOutOfStock = product.stockStatus === 'out-of-stock';

        return {
            productId: product.id,
            name: product.name,
            sku: product.sku,
            stockQuantity,
            lowStockThreshold,
            maxStockThreshold,
            stockStatus: product.stockStatus,
            unitPrice: Number(toNumber(product.price).toFixed(2)),
            lowStock: Boolean(isLowStock || isOutOfStock)
        };
    });

    const lowStockAlerts = items
        .filter((item) => item.lowStock)
        .map((item) => ({
            productId: item.productId,
            name: item.name,
            stockQuantity: item.stockQuantity,
            lowStockThreshold: item.lowStockThreshold
        }));

    return {
        limit: normalizedLimit,
        items,
        lowStockAlerts
    };
};

const getReports = async (params = {}) => {
    const [topProducts, traffic, inventory] = await Promise.all([
        getTopProducts(params),
        getTrafficReport(params),
        getInventoryReport({ limit: params.inventoryLimit ?? params.limit })
    ]);

    return {
        topProducts,
        traffic,
        inventory
    };
};

module.exports = {
    MAX_LIMIT,
    MAX_RANGE_DAYS,
    DEFAULT_RANGE_DAYS,
    DEFAULT_INVENTORY_LIMIT,
    MAX_INVENTORY_LIMIT,
    getReports,
    getTopProducts,
    getTrafficReport,
    getInventoryReport,
    resolveRange,
    buildLimit
};
