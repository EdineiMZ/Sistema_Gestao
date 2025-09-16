const { Op } = require('sequelize');

const normalizeStatusKey = (value) => {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim().toLowerCase();
};

const normalizeDateInput = (value) => {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim().slice(0, 32);
};

const parseDateInput = (value, { endOfDay = false } = {}) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    // Ajusta para início/fim do dia apenas quando formato simples YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        if (endOfDay) {
            date.setHours(23, 59, 59, 999);
        } else {
            date.setHours(0, 0, 0, 0);
        }
    }

    return date;
};

const sanitizeKeyword = (value, maxLength = 120) => {
    if (typeof value !== 'string') {
        return '';
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }

    const sanitized = trimmed
        .normalize('NFKC')
        .replace(/[\n\r\t]+/g, ' ')
        .replace(/["'`$<>]/g, '')
        .replace(/[%_\\]/g, '')
        .replace(/\s{2,}/g, ' ')
        .slice(0, maxLength);

    return sanitized;
};

const buildQueryFilters = (query = {}, options = {}) => {
    const {
        statusField = null,
        statusMap = {},
        allowedStatuses = [],
        defaultStatus = '',
        dateField = null,
        keywordFields = [],
        defaultFilters = {},
        maxKeywordLength = 120
    } = options;

    const where = { ...defaultFilters };
    const filters = {};
    const orConditions = [];

    if (statusField) {
        const rawStatus = normalizeStatusKey(query.status);
        const statusKey = rawStatus || normalizeStatusKey(defaultStatus);

        if (statusKey === 'all') {
            filters.status = 'all';
            if (Object.prototype.hasOwnProperty.call(where, statusField)) {
                delete where[statusField];
            }
        } else if (statusKey) {
            const mapped = Object.prototype.hasOwnProperty.call(statusMap, statusKey)
                ? statusMap[statusKey]
                : statusKey;

            const isAllowed =
                allowedStatuses.length === 0 ||
                allowedStatuses.includes(mapped) ||
                allowedStatuses.includes(statusKey);

            if (isAllowed) {
                if (typeof mapped === 'object' && mapped !== null && !Array.isArray(mapped)) {
                    where[statusField] = { ...mapped };
                } else {
                    where[statusField] = mapped;
                }
                filters.status = statusKey;
            }
        }
    }

    if (dateField) {
        const startDateInput = normalizeDateInput(query.startDate);
        const endDateInput = normalizeDateInput(query.endDate);

        let startDate = parseDateInput(startDateInput, { endOfDay: false });
        let endDate = parseDateInput(endDateInput, { endOfDay: true });

        if (startDate && endDate && startDate > endDate) {
            const swap = startDate;
            startDate = endDate;
            endDate = swap;
        }

        if (startDate) {
            filters.startDate = startDateInput;
        }
        if (endDate) {
            filters.endDate = endDateInput;
        }

        if (startDate || endDate) {
            const dateConditions = {};
            if (startDate) {
                dateConditions[Op.gte] = startDate;
            }
            if (endDate) {
                dateConditions[Op.lte] = endDate;
            }

            if (Object.prototype.hasOwnProperty.call(where, dateField) && typeof where[dateField] === 'object') {
                where[dateField] = { ...where[dateField], ...dateConditions };
            } else {
                where[dateField] = dateConditions;
            }
        }
    }

    const keyword = sanitizeKeyword(query.keyword, maxKeywordLength);
    let keywordNumeric = null;

    if (keyword) {
        filters.keyword = keyword;

        if (keywordFields.length) {
            const likeValue = `%${keyword}%`;
            keywordFields.forEach((field) => {
                if (typeof field === 'string' && field.trim().length) {
                    orConditions.push({ [field.trim()]: { [Op.iLike]: likeValue } });
                }
            });
        }

        if (/^\d+$/.test(keyword)) {
            const numeric = Number.parseInt(keyword, 10);
            if (Number.isSafeInteger(numeric)) {
                keywordNumeric = numeric;
            }
        }
    }

    return {
        where,
        filters,
        metadata: {
            keyword,
            keywordNumeric,
            orConditions
        }
    };
};

module.exports = {
    buildQueryFilters
};
