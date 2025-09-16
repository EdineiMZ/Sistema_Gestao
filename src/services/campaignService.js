// src/services/campaignService.js
const sanitizeHtml = require('sanitize-html');
const { Op } = require('sequelize');

const {
    Notification,
    User,
    AuditLog,
    sequelize
} = require('../../database/models');
const { buildQueryFilters } = require('../utils/queryBuilder');
const { sendBulkEmail } = require('../utils/email');
const { buildEmailContent } = require('../utils/placeholderUtils');
const { ROLE_LABELS, parseRole, sortRolesByHierarchy } = require('../constants/roles');

const DEFAULT_APP_NAME = process.env.APP_NAME || 'Sistema de Gestão';
const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}){1,2}$/;
const MAX_RULES = 20;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_RATE_LIMIT = Object.freeze({
    max: 90,
    intervalMs: 60_000,
    concurrency: 3
});

const CAMPAIGN_STATUS = Object.freeze({
    DRAFT: 'draft',
    SCHEDULED: 'scheduled',
    QUEUED: 'queued',
    SENDING: 'sending',
    SENT: 'sent',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
});

const CAMPAIGN_STATUS_LABELS = Object.freeze({
    [CAMPAIGN_STATUS.DRAFT]: 'Rascunho',
    [CAMPAIGN_STATUS.SCHEDULED]: 'Agendada',
    [CAMPAIGN_STATUS.QUEUED]: 'Na fila',
    [CAMPAIGN_STATUS.SENDING]: 'Enviando',
    [CAMPAIGN_STATUS.SENT]: 'Enviada',
    [CAMPAIGN_STATUS.FAILED]: 'Com falha',
    [CAMPAIGN_STATUS.CANCELLED]: 'Cancelada'
});

const SUPPORTED_FIELDS = Object.freeze({
    role: {
        operators: new Set(['in', 'notIn'])
    },
    active: {
        operators: new Set(['eq'])
    },
    creditBalance: {
        operators: new Set(['gte', 'lte', 'between'])
    },
    createdAt: {
        operators: new Set(['between', 'gte', 'lte'])
    },
    emailDomain: {
        operators: new Set(['contains', 'notContains'])
    }
});

const SEGMENT_FIELD_LABELS = Object.freeze({
    role: 'Perfil',
    active: 'Status',
    creditBalance: 'Crédito',
    createdAt: 'Criado em',
    emailDomain: 'Domínio do e-mail'
});

const SEGMENT_OPERATOR_LABELS = Object.freeze({
    in: 'em',
    notIn: 'fora de',
    eq: 'igual a',
    gte: '≥',
    lte: '≤',
    between: 'entre',
    contains: 'contém',
    notContains: 'não contém'
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sanitizeHtmlContent = (value) => {
    if (!value) return null;
    return sanitizeHtml(value, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([
            'h1', 'h2', 'h3', 'h4', 'img', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'span'
        ]),
        allowedAttributes: {
            '*': ['style', 'class'],
            a: ['href', 'name', 'target', 'rel'],
            img: ['src', 'alt', 'width', 'height']
        },
        allowedSchemes: ['http', 'https', 'mailto']
    });
};

const sanitizeColor = (value) => {
    if (typeof value !== 'string') {
        return '#0d6efd';
    }
    const trimmed = value.trim();
    return HEX_COLOR_REGEX.test(trimmed) ? trimmed : '#0d6efd';
};

const normalizeBoolean = (value) => {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return value !== 0;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on', 'ativo', 'active'].includes(normalized)) {
            return true;
        }
        if (['false', '0', 'no', 'off', 'inativo', 'inactive'].includes(normalized)) {
            return false;
        }
    }
    return null;
};

const parseNumber = (value) => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
        const normalized = value.replace(',', '.').trim();
        if (!normalized) return null;
        const parsed = Number.parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const parseDateInput = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return date;
};

const normalizeBetweenValue = (value, parser) => {
    if (!value) return null;
    let start;
    let end;

    if (Array.isArray(value)) {
        [start, end] = value;
    } else if (typeof value === 'object') {
        start = value.start ?? value.min ?? value.from;
        end = value.end ?? value.max ?? value.to;
    } else if (typeof value === 'string') {
        const parts = value.split(',').map((part) => part.trim());
        if (parts.length >= 2) {
            [start, end] = parts;
        }
    }

    const parsedStart = parser(start);
    const parsedEnd = parser(end);
    if (parsedStart === null || parsedEnd === null) {
        return null;
    }

    if (parsedStart > parsedEnd) {
        return [parsedEnd, parsedStart];
    }

    return [parsedStart, parsedEnd];
};

const parseRoleArray = (value) => {
    if (!value) return [];
    const source = Array.isArray(value) ? value : [value];
    const normalized = sortRolesByHierarchy(
        source
            .map((item) => parseRole(item, null))
            .filter(Boolean)
    );
    return normalized;
};

const normalizeSegmentFilters = (rawValue) => {
    if (!rawValue) {
        return { logic: 'AND', rules: [] };
    }

    let payload = rawValue;
    if (typeof rawValue === 'string') {
        try {
            payload = JSON.parse(rawValue);
        } catch (error) {
            return { logic: 'AND', rules: [] };
        }
    }

    if (!payload || typeof payload !== 'object') {
        return { logic: 'AND', rules: [] };
    }

    const logic = typeof payload.logic === 'string' && payload.logic.trim().toUpperCase() === 'OR'
        ? 'OR'
        : 'AND';

    const rulesSource = Array.isArray(payload.rules) ? payload.rules.slice(0, MAX_RULES) : [];
    const rules = [];

    for (const entry of rulesSource) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const field = typeof entry.field === 'string' ? entry.field.trim() : '';
        if (!field || !Object.prototype.hasOwnProperty.call(SUPPORTED_FIELDS, field)) {
            continue;
        }
        const operator = typeof entry.operator === 'string' ? entry.operator.trim() : '';
        const allowedOperators = SUPPORTED_FIELDS[field]?.operators;
        if (!operator || !allowedOperators?.has(operator)) {
            continue;
        }

        let normalizedRule = null;

        switch (field) {
            case 'role': {
                const roles = parseRoleArray(entry.value);
                if (!roles.length) break;
                normalizedRule = { field, operator, value: roles };
                break;
            }
            case 'active': {
                const booleanValue = normalizeBoolean(entry.value);
                if (booleanValue === null) break;
                normalizedRule = { field, operator, value: booleanValue };
                break;
            }
            case 'creditBalance': {
                if (operator === 'between') {
                    const range = normalizeBetweenValue(entry.value, parseNumber);
                    if (!range) break;
                    normalizedRule = { field, operator, value: range };
                    break;
                }
                const amount = parseNumber(entry.value);
                if (amount === null) break;
                normalizedRule = { field, operator, value: amount };
                break;
            }
            case 'createdAt': {
                const range = operator === 'between'
                    ? normalizeBetweenValue(entry.value, parseDateInput)
                    : null;

                if (operator === 'between') {
                    if (!range) break;
                    normalizedRule = { field, operator, value: range.map((date) => date.toISOString()) };
                    break;
                }

                const dateValue = parseDateInput(entry.value);
                if (!dateValue) break;
                normalizedRule = { field, operator, value: dateValue.toISOString() };
                break;
            }
            case 'emailDomain': {
                if (typeof entry.value !== 'string') break;
                const domain = entry.value.trim().replace(/^@/, '').toLowerCase();
                if (!domain) break;
                normalizedRule = { field, operator, value: domain };
                break;
            }
            default:
                break;
        }

        if (normalizedRule) {
            rules.push(normalizedRule);
        }
    }

    return { logic, rules };
};

const buildSegmentSummary = (filters) => {
    const normalized = normalizeSegmentFilters(filters);
    const summaries = [];

    const hasActiveRule = normalized.rules.some((rule) => rule.field === 'active');
    if (!hasActiveRule) {
        summaries.push('Somente usuários ativos');
    }

    normalized.rules.forEach((rule) => {
        const label = SEGMENT_FIELD_LABELS[rule.field] || rule.field;
        const operatorLabel = SEGMENT_OPERATOR_LABELS[rule.operator] || rule.operator;

        switch (rule.field) {
            case 'role': {
                const roleLabels = rule.value.map((role) => ROLE_LABELS[role] || role);
                const joiner = rule.operator === 'notIn' ? ' exceto ' : ' ';
                summaries.push(`${label}${joiner}${roleLabels.join(', ')}`);
                break;
            }
            case 'active': {
                summaries.push(rule.value ? 'Usuários ativos' : 'Usuários inativos');
                break;
            }
            case 'creditBalance': {
                if (rule.operator === 'between') {
                    summaries.push(`${label} entre ${Number(rule.value[0]).toFixed(2)} e ${Number(rule.value[1]).toFixed(2)}`);
                } else {
                    summaries.push(`${label} ${operatorLabel} ${Number(rule.value).toFixed(2)}`);
                }
                break;
            }
            case 'createdAt': {
                if (rule.operator === 'between') {
                    const [start, end] = rule.value;
                    summaries.push(`${label} entre ${new Date(start).toLocaleDateString('pt-BR')} e ${new Date(end).toLocaleDateString('pt-BR')}`);
                } else {
                    summaries.push(`${label} ${operatorLabel} ${new Date(rule.value).toLocaleDateString('pt-BR')}`);
                }
                break;
            }
            case 'emailDomain': {
                const prefix = rule.operator === 'notContains' ? 'Sem e-mails que ' : 'E-mails que ';
                summaries.push(`${prefix}${operatorLabel} @${rule.value}`);
                break;
            }
            default:
                break;
        }
    });

    if (!summaries.length) {
        summaries.push('Base ativa completa');
    }

    return { normalized, summaries };
};

const buildRecipientWhere = (segmentFilters) => {
    const { normalized } = buildSegmentSummary(segmentFilters);
    const where = {};
    const andConditions = [
        { email: { [Op.ne]: null } },
        { email: { [Op.ne]: '' } }
    ];

    const ruleConditions = normalized.rules.map((rule) => {
        switch (rule.field) {
            case 'role':
                if (rule.operator === 'in') {
                    return { role: { [Op.in]: rule.value } };
                }
                return { role: { [Op.notIn]: rule.value } };
            case 'active':
                return { active: rule.value };
            case 'creditBalance':
                if (rule.operator === 'between') {
                    return {
                        creditBalance: {
                            [Op.between]: [rule.value[0], rule.value[1]]
                        }
                    };
                }
                return {
                    creditBalance: {
                        [rule.operator === 'gte' ? Op.gte : Op.lte]: rule.value
                    }
                };
            case 'createdAt':
                if (rule.operator === 'between') {
                    return {
                        createdAt: {
                            [Op.between]: [new Date(rule.value[0]), new Date(rule.value[1])]
                        }
                    };
                }
                return {
                    createdAt: {
                        [rule.operator === 'gte' ? Op.gte : Op.lte]: new Date(rule.value)
                    }
                };
            case 'emailDomain': {
                const column = sequelize.col('email');
                const domainPattern = `%@${rule.value}`;
                const comparator = rule.operator === 'notContains' ? Op.notLike : Op.like;
                return sequelize.where(
                    sequelize.fn('lower', column),
                    { [comparator]: domainPattern }
                );
            }
            default:
                return null;
        }
    }).filter(Boolean);

    const useOrLogic = normalized.logic === 'OR';

    if (!normalized.rules.some((rule) => rule.field === 'active')) {
        andConditions.push({ active: true });
    }

    if (useOrLogic && ruleConditions.length) {
        andConditions.push({ [Op.or]: ruleConditions });
    } else {
        andConditions.push(...ruleConditions);
    }

    if (andConditions.length) {
        where[Op.and] = andConditions;
    }

    return {
        where,
        normalized
    };
};

const estimateRecipients = async (segmentFilters) => {
    const { where } = buildRecipientWhere(segmentFilters);
    return User.count({ where });
};

async function* iterateRecipients(segmentFilters, { batchSize = DEFAULT_BATCH_SIZE } = {}) {
    const { where } = buildRecipientWhere(segmentFilters);
    let offset = 0;
    const safeBatch = Math.max(10, Math.min(batchSize, 500));

    while (true) {
        const users = await User.findAll({
            where,
            attributes: ['id', 'name', 'email', 'role', 'creditBalance', 'active'],
            order: [['id', 'ASC']],
            limit: safeBatch,
            offset,
            raw: true
        });

        if (!users.length) {
            break;
        }

        yield users;
        offset += users.length;

        await delay(5);
    }
}

const parseScheduledAt = (value) => {
    const parsed = parseDateInput(value);
    return parsed ? parsed : null;
};

const resolveInitialStatus = (scheduledAt) => {
    if (!scheduledAt) {
        return CAMPAIGN_STATUS.DRAFT;
    }
    const now = Date.now();
    return scheduledAt.getTime() > now ? CAMPAIGN_STATUS.SCHEDULED : CAMPAIGN_STATUS.QUEUED;
};

const createAuditLog = async ({ userId, action, resource, ip }) => {
    if (!AuditLog || typeof AuditLog.create !== 'function') {
        return null;
    }
    return AuditLog.create({
        userId: userId ?? null,
        action,
        resource,
        ip: ip ? String(ip).slice(0, 45) : null
    });
};

const createCampaign = async (payload, { actorId, ip } = {}) => {
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    const message = typeof payload.message === 'string' ? payload.message.trim() : '';
    const previewText = typeof payload.previewText === 'string'
        ? payload.previewText.trim().slice(0, 120)
        : null;

    if (!title) {
        throw new Error('Título da campanha é obrigatório.');
    }
    if (!message && !payload.messageHtml) {
        throw new Error('Defina uma mensagem para o disparo da campanha.');
    }

    const messageHtml = sanitizeHtmlContent(payload.messageHtml);
    const accentColor = sanitizeColor(payload.accentColor);
    const scheduledAt = parseScheduledAt(payload.scheduledAt);
    const segmentFilters = normalizeSegmentFilters(payload.segmentFilters);
    const status = resolveInitialStatus(scheduledAt);

    const campaign = await Notification.create({
        title,
        message: message || ' ',
        messageHtml,
        type: 'campaign',
        triggerDate: scheduledAt,
        active: true,
        sendToAll: false,
        filters: null,
        segmentFilters,
        scheduledAt,
        status,
        accentColor,
        previewText,
        sent: false
    });

    await createAuditLog({
        userId: actorId,
        action: 'campaign.created',
        resource: `campaign:${campaign.id}`,
        ip
    });

    return campaign;
};

const queueCampaignById = async (campaignId, { scheduledAt, actorId, ip } = {}) => {
    const campaign = await Notification.findOne({
        where: { id: campaignId, type: 'campaign' }
    });

    if (!campaign) {
        throw new Error('Campanha não encontrada.');
    }

    const normalizedFilters = normalizeSegmentFilters(campaign.segmentFilters);
    const scheduleDate = parseScheduledAt(scheduledAt) || campaign.scheduledAt || new Date();
    const status = resolveInitialStatus(scheduleDate);

    await campaign.update({
        scheduledAt: scheduleDate,
        triggerDate: scheduleDate,
        status,
        segmentFilters: normalizedFilters
    });

    await createAuditLog({
        userId: actorId,
        action: 'campaign.queued',
        resource: `campaign:${campaign.id}`,
        ip
    });

    return campaign;
};

const buildEmailPayloads = (campaign, recipients) => {
    const payloads = [];

    recipients.forEach((user) => {
        if (!user.email) return;
        const content = buildEmailContent(campaign, {
            user,
            extras: {
                organizationName: DEFAULT_APP_NAME
            }
        });

        payloads.push({
            to: user.email,
            subject: content.subject,
            payload: {
                text: content.text,
                html: content.html,
                headers: content.previewText
                    ? { 'X-Entity-Preview': content.previewText }
                    : undefined
            }
        });
    });

    return payloads;
};

const dispatchCampaignInstance = async (campaign, { actorId, ip, rateLimit, batchSize } = {}) => {
    const normalizedFilters = normalizeSegmentFilters(campaign.segmentFilters);
    const scheduleReference = campaign.scheduledAt || new Date();

    await campaign.update({
        status: CAMPAIGN_STATUS.SENDING,
        scheduledAt: scheduleReference,
        triggerDate: scheduleReference,
        segmentFilters: normalizedFilters
    });

    const appliedRateLimit = {
        max: rateLimit?.max ?? DEFAULT_RATE_LIMIT.max,
        intervalMs: rateLimit?.intervalMs ?? DEFAULT_RATE_LIMIT.intervalMs,
        concurrency: rateLimit?.concurrency ?? DEFAULT_RATE_LIMIT.concurrency
    };

    const safeBatchSize = batchSize ?? DEFAULT_BATCH_SIZE;
    let totalSent = 0;
    const errors = [];

    for await (const batch of iterateRecipients(normalizedFilters, { batchSize: safeBatchSize })) {
        const messages = buildEmailPayloads(campaign, batch);
        if (!messages.length) {
            continue;
        }

        try {
            const result = await sendBulkEmail(messages, {
                rateLimit: appliedRateLimit,
                concurrency: appliedRateLimit.concurrency,
                stopOnError: false,
                onError: (error, job) => {
                    errors.push({ error, job });
                }
            });
            totalSent += result.sent;
        } catch (error) {
            errors.push({ error });
        }
    }

    const status = errors.length ? CAMPAIGN_STATUS.FAILED : CAMPAIGN_STATUS.SENT;

    await campaign.update({
        status,
        sent: status === CAMPAIGN_STATUS.SENT,
        triggerDate: new Date(),
        segmentFilters: normalizedFilters
    });

    await createAuditLog({
        userId: actorId,
        action: status === CAMPAIGN_STATUS.SENT ? 'campaign.dispatched' : 'campaign.failed',
        resource: `campaign:${campaign.id}`,
        ip
    });

    if (errors.length) {
        const aggregateError = new Error(`Falha ao enviar campanha ${campaign.id}.`);
        aggregateError.details = errors;
        throw aggregateError;
    }

    return {
        totalSent
    };
};

const dispatchCampaignById = async (campaignId, options = {}) => {
    const campaign = await Notification.findOne({
        where: { id: campaignId, type: 'campaign' }
    });

    if (!campaign) {
        throw new Error('Campanha não encontrada.');
    }

    return dispatchCampaignInstance(campaign, options);
};

const dispatchPendingCampaigns = async ({ limit = 5, ...options } = {}) => {
    const now = new Date();
    const campaigns = await Notification.findAll({
        where: {
            type: 'campaign',
            status: {
                [Op.in]: [CAMPAIGN_STATUS.QUEUED, CAMPAIGN_STATUS.SCHEDULED]
            },
            active: true,
            scheduledAt: {
                [Op.not]: null,
                [Op.lte]: now
            }
        },
        order: [['scheduledAt', 'ASC']],
        limit: Math.max(1, limit)
    });

    const results = [];

    for (const campaign of campaigns) {
        try {
            const result = await dispatchCampaignInstance(campaign, options);
            results.push({ id: campaign.id, status: 'sent', ...result });
        } catch (error) {
            results.push({ id: campaign.id, status: 'failed', error });
        }
    }

    return results;
};

const listCampaigns = async (query = {}) => {
    const statusMap = {
        draft: CAMPAIGN_STATUS.DRAFT,
        scheduled: CAMPAIGN_STATUS.SCHEDULED,
        queued: CAMPAIGN_STATUS.QUEUED,
        sending: CAMPAIGN_STATUS.SENDING,
        sent: CAMPAIGN_STATUS.SENT,
        failed: CAMPAIGN_STATUS.FAILED,
        cancelled: CAMPAIGN_STATUS.CANCELLED
    };

    const { where, filters, metadata } = buildQueryFilters(query, {
        statusField: 'status',
        statusMap,
        allowedStatuses: Object.values(CAMPAIGN_STATUS),
        defaultStatus: 'all',
        dateField: 'scheduledAt',
        keywordFields: ['title', 'message', 'previewText']
    });

    where.type = 'campaign';

    const campaigns = await Notification.findAll({
        where,
        order: [
            ['scheduledAt', 'DESC'],
            ['id', 'DESC']
        ]
    });

    const detailed = await Promise.all(campaigns.map(async (campaign) => {
        const plain = campaign.get({ plain: true });
        const { normalized, summaries } = buildSegmentSummary(plain.segmentFilters);
        const recipientEstimate = await estimateRecipients(normalized);
        return {
            ...plain,
            statusLabel: CAMPAIGN_STATUS_LABELS[plain.status] || plain.status,
            segmentSummary: summaries,
            segmentLogic: normalized.logic,
            recipientEstimate
        };
    }));

    return {
        campaigns: detailed,
        filters,
        metadata
    };
};

module.exports = {
    CAMPAIGN_STATUS,
    CAMPAIGN_STATUS_LABELS,
    createCampaign,
    queueCampaignById,
    dispatchCampaignById,
    dispatchPendingCampaigns,
    listCampaigns,
    buildSegmentSummary,
    estimateRecipients
};
