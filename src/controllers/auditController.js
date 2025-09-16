const { Op } = require('sequelize');
const { AuditLog, User, Sequelize } = require('../../database/models');

const parseDate = (value, endOfDay = false) => {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    if (endOfDay) {
        date.setHours(23, 59, 59, 999);
    } else {
        date.setHours(0, 0, 0, 0);
    }
    return date;
};

const buildQueryBuilder = (filters, pageSize) => {
    const baseParams = new URLSearchParams();

    if (filters.startDate) baseParams.set('startDate', filters.startDate);
    if (filters.endDate) baseParams.set('endDate', filters.endDate);
    if (filters.userId) baseParams.set('userId', filters.userId);
    if (filters.action) baseParams.set('action', filters.action);
    if (pageSize) baseParams.set('pageSize', String(pageSize));

    return (page) => {
        const params = new URLSearchParams(baseParams.toString());
        params.set('page', String(page));
        return params.toString();
    };
};

module.exports = {
    listLogs: async (req, res) => {
        try {
            const pageFromQuery = Number.parseInt(req.query.page, 10);
            const pageSizeFromQuery = Number.parseInt(req.query.pageSize, 10);

            const filters = {
                startDate: typeof req.query.startDate === 'string' ? req.query.startDate.trim() : '',
                endDate: typeof req.query.endDate === 'string' ? req.query.endDate.trim() : '',
                userId: typeof req.query.userId === 'string' ? req.query.userId.trim() : '',
                action: typeof req.query.action === 'string' ? req.query.action.trim() : ''
            };

            const pageSize = Number.isInteger(pageSizeFromQuery)
                ? Math.min(Math.max(pageSizeFromQuery, 5), 100)
                : 20;
            const requestedPage = Number.isInteger(pageFromQuery) && pageFromQuery > 0 ? pageFromQuery : 1;

            const where = {};

            if (filters.userId) {
                const parsedUserId = Number.parseInt(filters.userId, 10);
                if (Number.isInteger(parsedUserId)) {
                    where.userId = parsedUserId;
                } else {
                    filters.userId = '';
                }
            }

            if (filters.action) {
                where.action = { [Op.like]: `%${filters.action}%` };
            }

            const startDate = parseDate(filters.startDate);
            const endDate = parseDate(filters.endDate, true);

            if (startDate || endDate) {
                where.createdAt = {};
                if (startDate) {
                    where.createdAt[Op.gte] = startDate;
                }
                if (endDate) {
                    where.createdAt[Op.lte] = endDate;
                }
            }

            const include = [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'name', 'email']
                }
            ];

            const offset = (requestedPage - 1) * pageSize;

            const { count, rows } = await AuditLog.findAndCountAll({
                where,
                include,
                order: [['createdAt', 'DESC']],
                limit: pageSize,
                offset
            });

            const totalItems = count;
            const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / pageSize);
            const currentPage = Math.min(requestedPage, totalPages);

            let logs = rows;

            if (requestedPage !== currentPage) {
                const adjustedOffset = (currentPage - 1) * pageSize;
                logs = await AuditLog.findAll({
                    where,
                    include,
                    order: [['createdAt', 'DESC']],
                    limit: pageSize,
                    offset: adjustedOffset
                });
            }

            const windowSize = 2;
            const startPage = Math.max(1, currentPage - windowSize);
            const endPage = Math.min(totalPages, currentPage + windowSize);
            const pages = [];
            for (let page = startPage; page <= endPage; page += 1) {
                pages.push(page);
            }

            const users = await User.findAll({
                attributes: ['id', 'name', 'email'],
                order: [['name', 'ASC']]
            });

            const actionRecords = await AuditLog.findAll({
                attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('action')), 'action']],
                order: [[Sequelize.col('action'), 'ASC']]
            });
            const actions = actionRecords
                .map(record => record.get('action'))
                .filter(Boolean);

            const buildQuery = buildQueryBuilder(filters, pageSize);

            return res.render('audit/logs', {
                pageTitle: 'Logs de auditoria',
                logs,
                users,
                actions,
                filters,
                pagination: {
                    currentPage,
                    totalPages,
                    totalItems,
                    pageSize,
                    pages,
                    buildQuery
                }
            });
        } catch (error) {
            console.error('Erro ao carregar logs de auditoria:', error);
            req.flash('error_msg', 'Não foi possível carregar os logs de auditoria.');
            return res.redirect('/');
        }
    }
};
