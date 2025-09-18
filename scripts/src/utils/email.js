// src/utils/email.js
const path = require('path');
const ejs = require('ejs');
const crypto = require('node:crypto');
const nodemailer = require('nodemailer');

let financeReportingService = null;
try {
    // eslint-disable-next-line global-require
    financeReportingService = require('../services/financeReportingService');
} catch (error) {
    financeReportingService = null;
}

let gmailWhitespaceWarningIssued = false;

const sanitizeUser = (value) => (typeof value === 'string' ? value.trim() : '');

const sanitizePassword = (value) => {
    if (typeof value !== 'string') {
        return '';
    }

    const trimmed = value.trim();
    if (/\s/.test(trimmed)) {
        if (!gmailWhitespaceWarningIssued) {
            console.warn(
                'GMAIL_PASS contém espaços em branco. Espaços serão removidos para compatibilidade com senhas do Gmail App Password.'
            );
            gmailWhitespaceWarningIssued = true;
        }
        return trimmed.replace(/\s+/g, '');
    }

    return trimmed;
};

const GMAIL_USER = sanitizeUser(process.env.GMAIL_USER);
const GMAIL_PASS = sanitizePassword(process.env.GMAIL_PASS);
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Sistema de Gestão';

// Cria o transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: GMAIL_USER,
        pass: GMAIL_PASS
    }
});

const shouldMockEmail = () => process.env.EMAIL_DISABLED === 'true';

const EMAIL_TEMPLATES_DIR = path.join(__dirname, '..', 'views', 'notifications');
const TEMPLATE_OPTIONS = Object.freeze({ async: true, cache: true });

const financeUtils = financeReportingService?.utils || {};
const DEFAULT_STATUS_META = financeUtils.DEFAULT_STATUS_META || {
    healthy: { key: 'healthy', label: 'Consumo saudável', textColor: '#065f46', barColor: '#10b981', badgeClass: 'bg-success-subtle text-success' },
    caution: { key: 'caution', label: 'Consumo moderado', textColor: '#1d4ed8', barColor: '#2563eb', badgeClass: 'bg-primary-subtle text-primary' },
    warning: { key: 'warning', label: 'Atenção ao consumo', textColor: '#b45309', barColor: '#f59e0b', badgeClass: 'bg-warning-subtle text-warning' },
    critical: { key: 'critical', label: 'Limite excedido', textColor: '#b91c1c', barColor: '#ef4444', badgeClass: 'bg-danger-subtle text-danger' }
};

const resolveBudgetStatus = typeof financeUtils.resolveBudgetStatus === 'function'
    ? financeUtils.resolveBudgetStatus
    : (consumption, limit, thresholds = []) => {
        const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 0;
        const safeConsumption = Number.isFinite(Number(consumption)) ? Number(consumption) : 0;
        const ratio = safeLimit > 0 ? (safeConsumption / safeLimit) * 100 : null;
        const sortedThresholds = Array.isArray(thresholds)
            ? thresholds
                .map((item) => {
                    const parsed = Number.parseFloat(item);
                    return Number.isFinite(parsed) ? parsed : null;
                })
                .filter((item) => item !== null)
                .sort((a, b) => a - b)
            : [];

        if (ratio !== null && ratio >= 100) {
            return { ...DEFAULT_STATUS_META.critical };
        }

        if (sortedThresholds.length) {
            const highestThreshold = sortedThresholds[sortedThresholds.length - 1];
            if (safeConsumption >= highestThreshold) {
                return { ...DEFAULT_STATUS_META.warning };
            }
        }

        if (ratio !== null && ratio >= 85) {
            return { ...DEFAULT_STATUS_META.warning };
        }

        if (ratio !== null && ratio >= 60) {
            return { ...DEFAULT_STATUS_META.caution };
        }

        return { ...DEFAULT_STATUS_META.healthy };
    };

const normalizeThresholdList = typeof financeUtils.normalizeThresholdList === 'function'
    ? financeUtils.normalizeThresholdList
    : (value) => {
        if (value === null || value === undefined) {
            return [];
        }
        const rawList = Array.isArray(value) ? value : [value];
        const normalized = rawList
            .map((item) => {
                const parsed = Number.parseFloat(item);
                if (!Number.isFinite(parsed) || parsed <= 0) {
                    return null;
                }
                return Number(parsed.toFixed(2));
            })
            .filter((item) => item !== null);

        const unique = Array.from(new Set(normalized));
        unique.sort((a, b) => a - b);
        return unique;
    };

const BUDGET_STATUS_DESCRIPTIONS = Object.freeze({
    healthy: 'Consumo dentro do planejado. Continue acompanhando os lançamentos.',
    caution: 'Consumo moderado. Recomenda-se monitorar as próximas movimentações.',
    warning: 'Categoria próxima do limite configurado. Reavalie os gastos recentes.',
    critical: 'Limite excedido. Revise imediatamente os lançamentos desta categoria.'
});

const BUDGET_ALERT_DEFAULT_ROUTE = '/finance?view=budgets#budget-overview';
const BUDGET_TOKEN_MIN_TTL_SECONDS = 300; // 5 minutos
const DEFAULT_BUDGET_TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24h

const BULK_DEFAULTS = Object.freeze({
    max: 90,
    intervalMs: 60_000,
    concurrency: 2,
    stopOnError: false
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const encodeBase64Url = (input) => {
    if (input === null || input === undefined) {
        return '';
    }
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
    return buffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
};

const sanitizeSecret = (value) => {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim();
};

let budgetSecretWarningIssued = false;
const getBudgetLinkSecret = (fallbackSecret) => {
    const candidates = [
        fallbackSecret,
        sanitizeSecret(process.env.BUDGET_LINK_SECRET),
        sanitizeSecret(process.env.EMAIL_LINK_SECRET),
        sanitizeSecret(process.env.SESSION_SECRET),
        sanitizeSecret(process.env.APP_SECRET)
    ].filter((candidate) => Boolean(candidate));

    if (candidates.length) {
        return candidates[0];
    }

    if (!budgetSecretWarningIssued) {
        console.warn('Nenhum segredo seguro definido para links de orçamento. Utilize BUDGET_LINK_SECRET para assinar os tokens.');
        budgetSecretWarningIssued = true;
    }

    return 'budget-link-secret';
};

const parseTtlSeconds = (value) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    return Math.max(BUDGET_TOKEN_MIN_TTL_SECONDS, Math.floor(parsed));
};

const getDefaultBudgetTokenTtl = () => {
    const envTtl = parseTtlSeconds(process.env.BUDGET_LINK_TTL || process.env.BUDGET_TOKEN_TTL);
    if (envTtl !== null) {
        return envTtl;
    }
    return DEFAULT_BUDGET_TOKEN_TTL_SECONDS;
};

const normalizeBaseUrl = (value) => {
    if (typeof value !== 'string') {
        return '';
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }
    if (!/^https?:\/\//i.test(trimmed)) {
        return '';
    }
    try {
        const url = new URL(trimmed);
        url.hash = '';
        url.search = '';
        const normalizedPath = url.pathname.replace(/\/+$/g, '');
        return `${url.protocol}//${url.host}${normalizedPath}`;
    } catch (error) {
        return '';
    }
};

const buildRelativeBudgetPath = (routePath = BUDGET_ALERT_DEFAULT_ROUTE) => {
    if (typeof routePath !== 'string') {
        return BUDGET_ALERT_DEFAULT_ROUTE;
    }
    const trimmed = routePath.trim();
    if (!trimmed) {
        return BUDGET_ALERT_DEFAULT_ROUTE;
    }

    if (/^https?:\/\//i.test(trimmed)) {
        try {
            const url = new URL(trimmed);
            const normalizedPath = url.pathname.startsWith('/') ? url.pathname : `/${url.pathname}`;
            const query = url.search || '';
            const hash = url.hash || '';
            return `${normalizedPath}${query}${hash}`;
        } catch (error) {
            return BUDGET_ALERT_DEFAULT_ROUTE;
        }
    }

    if (trimmed.startsWith('/')) {
        return trimmed;
    }

    return `/${trimmed}`;
};

const sanitizeColor = (value, fallback = '#4f46e5') => {
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return fallback;
    }

    if (/^#([0-9a-fA-F]{3}){1,2}$/.test(trimmed)) {
        return trimmed;
    }

    if (/^rgb(a)?\(/i.test(trimmed)) {
        return trimmed;
    }

    return fallback;
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
});

const percentFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
});

const formatCurrency = (value) => {
    const number = Number.parseFloat(value);
    if (!Number.isFinite(number)) {
        return currencyFormatter.format(0);
    }
    return currencyFormatter.format(number);
};

const formatPercentageLabel = (value) => {
    const number = Number.parseFloat(value);
    if (!Number.isFinite(number)) {
        return percentFormatter.format(0);
    }
    return percentFormatter.format(number / 100);
};

const formatMonthLabel = (value) => {
    if (!value) {
        return '';
    }

    if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value.trim())) {
        const trimmed = value.trim();
        const [yearPart, monthPart] = trimmed.split('-');
        const year = Number.parseInt(yearPart, 10);
        const month = Number.parseInt(monthPart, 10);

        if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
            const date = new Date(year, month - 1, 1);
            if (!Number.isNaN(date.getTime())) {
                return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
            }
        }

        return trimmed;
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

const extractFirstName = (fullName) => {
    if (typeof fullName !== 'string') {
        return '';
    }
    const parts = fullName.trim().split(/\s+/);
    if (!parts.length) {
        return '';
    }
    return parts[0];
};

const toNumber = (value) => {
    if (value === null || value === undefined || value === '') {
        return 0;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? Number.parseFloat(value.toFixed(2)) : 0;
    }
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
        return 0;
    }
    return Number.parseFloat(parsed.toFixed(2));
};

const STATUS_BADGE_BACKGROUNDS = Object.freeze({
    healthy: '#dcfce7',
    caution: '#dbeafe',
    warning: '#fef3c7',
    critical: '#fee2e2'
});

const createBudgetAccessToken = ({ budgetId, userId, expiresIn, now = new Date(), secret }) => {
    const issuedAtSeconds = Math.floor((now instanceof Date ? now.getTime() : Date.now()) / 1000);
    const ttlSeconds = Number.isFinite(Number(expiresIn))
        ? Math.max(BUDGET_TOKEN_MIN_TTL_SECONDS, Math.floor(Number(expiresIn)))
        : getDefaultBudgetTokenTtl();
    const expiresAtSeconds = issuedAtSeconds + ttlSeconds;

    const payload = {
        bid: budgetId ?? null,
        uid: userId ?? null,
        iat: issuedAtSeconds,
        exp: expiresAtSeconds
    };

    const payloadString = JSON.stringify(payload);
    const resolvedSecret = getBudgetLinkSecret(secret);
    const signature = crypto.createHmac('sha256', resolvedSecret).update(payloadString).digest();

    return {
        token: `${encodeBase64Url(payloadString)}.${encodeBase64Url(signature)}`,
        issuedAtSeconds,
        expiresAtSeconds
    };
};

const buildBudgetAccessLink = ({
    budgetId,
    userId,
    baseUrl,
    routePath,
    expiresIn,
    now = new Date(),
    secret
} = {}) => {
    const pathTemplate = buildRelativeBudgetPath(routePath);
    const hashIndex = pathTemplate.indexOf('#');
    const hashSegment = hashIndex >= 0 ? pathTemplate.slice(hashIndex) : '';
    const pathAndQuery = hashIndex >= 0 ? pathTemplate.slice(0, hashIndex) : pathTemplate;
    const [rawPath, rawQuery = ''] = pathAndQuery.split('?');
    const normalizedPath = rawPath ? (rawPath.startsWith('/') ? rawPath : `/${rawPath}`) : '/finance';
    const searchParams = new URLSearchParams(rawQuery);

    if (budgetId !== undefined && budgetId !== null) {
        searchParams.set('budgetId', String(budgetId));
    }

    const { token, issuedAtSeconds, expiresAtSeconds } = createBudgetAccessToken({
        budgetId,
        userId,
        expiresIn,
        now,
        secret
    });

    searchParams.set('budgetToken', token);

    const querySegment = searchParams.toString();
    const relativePath = `${normalizedPath}${querySegment ? `?${querySegment}` : ''}${hashSegment}`;

    const resolvedBaseUrl = normalizeBaseUrl(
        baseUrl
        || process.env.APP_BASE_URL
        || process.env.APP_URL
        || process.env.PUBLIC_APP_URL
    );

    let accessUrl = relativePath;
    if (resolvedBaseUrl) {
        try {
            accessUrl = new URL(relativePath, `${resolvedBaseUrl}/`).toString();
        } catch (error) {
            accessUrl = relativePath;
        }
    }

    return {
        url: accessUrl,
        relativePath,
        token,
        issuedAt: new Date(issuedAtSeconds * 1000),
        expiresAt: new Date(expiresAtSeconds * 1000)
    };
};

const buildBudgetMetrics = (monthlyLimit, consumption, remaining) => {
    const metrics = [
        {
            key: 'limit',
            label: 'Limite mensal',
            value: formatCurrency(monthlyLimit)
        },
        {
            key: 'consumption',
            label: 'Consumido no período',
            value: formatCurrency(consumption)
        }
    ];

    const remainingMetric = {
        key: remaining >= 0 ? 'available' : 'exceeded',
        label: remaining >= 0 ? 'Disponível' : 'Excedido',
        value: formatCurrency(Math.abs(remaining)),
        tone: remaining >= 0 ? 'positive' : 'negative'
    };

    if (remaining >= 0) {
        remainingMetric.helperText = 'Ainda há saldo para novas movimentações neste mês.';
    } else {
        remainingMetric.helperText = 'Recomenda-se revisar lançamentos ou ampliar o limite do orçamento.';
    }

    metrics.push(remainingMetric);

    return metrics;
};

const buildBudgetInsights = ({ usageLabel, remaining, triggeredThreshold, statusDescription }) => {
    const insights = [];

    if (usageLabel) {
        insights.push(usageLabel);
    }

    if (triggeredThreshold) {
        insights.push(`O alerta configurado em ${triggeredThreshold.valueLabel} já foi atingido.`);
    }

    if (remaining > 0) {
        insights.push(`Ainda restam ${formatCurrency(remaining)} disponíveis neste orçamento.`);
    } else if (remaining < 0) {
        insights.push(`O orçamento está excedido em ${formatCurrency(Math.abs(remaining))}.`);
    }

    if (statusDescription) {
        insights.push(statusDescription);
    }

    return Array.from(new Set(insights));
};

const buildBudgetAlertContext = (budgetInput = {}, options = {}) => {
    const {
        user = {},
        appName = EMAIL_FROM_NAME,
        organizationName = EMAIL_FROM_NAME,
        baseUrl,
        routePath = BUDGET_ALERT_DEFAULT_ROUTE,
        expiresIn,
        now = new Date(),
        secret,
        timeZone = 'UTC'
    } = options;

    const resolvedTimeZone = typeof timeZone === 'string' && timeZone.trim() ? timeZone.trim() : 'UTC';

    const budgetId = budgetInput?.budgetId ?? budgetInput?.id ?? null;
    const monthlyLimit = toNumber(budgetInput?.monthlyLimit ?? budgetInput?.limit);
    const consumption = toNumber(budgetInput?.consumption ?? budgetInput?.spent);
    const remaining = Number.parseFloat((monthlyLimit - consumption).toFixed(2));
    const thresholdInput = budgetInput?.thresholds ?? [];
    const thresholdCandidates = Array.isArray(thresholdInput) ? thresholdInput : [thresholdInput];
    const absoluteThresholds = thresholdCandidates
        .map((item) => {
            const parsed = Number.parseFloat(item);
            if (!Number.isFinite(parsed) || parsed <= 1) {
                return null;
            }
            return Number(parsed.toFixed(2));
        })
        .filter((item) => item !== null);

    let thresholds = normalizeThresholdList(thresholdCandidates);
    if (absoluteThresholds.length) {
        const uniqueAbsoluteThresholds = Array.from(new Set(absoluteThresholds));
        uniqueAbsoluteThresholds.sort((a, b) => a - b);
        thresholds = uniqueAbsoluteThresholds;
    }
    const statusMeta = resolveBudgetStatus(consumption, monthlyLimit, thresholds) || DEFAULT_STATUS_META.healthy;
    const usagePercent = monthlyLimit > 0
        ? Number.parseFloat(((consumption / monthlyLimit) * 100).toFixed(1))
        : 0;
    const usageLabel = monthlyLimit > 0
        ? `${usagePercent.toFixed(1).replace('.', ',')}% do limite utilizado`
        : 'Nenhum limite mensal definido para esta categoria.';
    const monthLabel = budgetInput?.monthLabel
        || formatMonthLabel(budgetInput?.month || budgetInput?.monthKey || budgetInput?.referenceMonth);

    const triggeredThresholdValue = thresholds.filter((threshold) => consumption >= threshold).pop();
    const triggeredThreshold = triggeredThresholdValue
        ? {
            value: triggeredThresholdValue,
            valueLabel: formatCurrency(triggeredThresholdValue),
            percentage: monthlyLimit > 0
                ? Number.parseFloat(((triggeredThresholdValue / monthlyLimit) * 100).toFixed(1))
                : null
        }
        : null;

    const links = buildBudgetAccessLink({
        budgetId,
        userId: user?.id ?? budgetInput?.userId ?? null,
        baseUrl,
        routePath,
        expiresIn,
        now,
        secret
    });

    const statusDescription = BUDGET_STATUS_DESCRIPTIONS[statusMeta.key] || BUDGET_STATUS_DESCRIPTIONS.healthy;
    const metrics = buildBudgetMetrics(monthlyLimit, consumption, remaining);
    const insights = buildBudgetInsights({
        usageLabel,
        remaining,
        triggeredThreshold,
        statusDescription
    });

    const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: resolvedTimeZone
    });

    const formatDateLabel = (date) => {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return '';
        }
        return dateFormatter.format(date);
    };

    const statusTone = {
        textColor: statusMeta.textColor || '#0f172a',
        badgeClass: statusMeta.badgeClass || 'bg-primary-subtle text-primary',
        badgeBackground: STATUS_BADGE_BACKGROUNDS[statusMeta.key] || '#e0e7ff',
        barColor: statusMeta.barColor || '#4f46e5'
    };

    const accentColor = sanitizeColor(
        budgetInput?.accentColor
        || budgetInput?.categoryColor
        || statusTone.barColor
        || '#4f46e5'
    );

    const categoryName = budgetInput?.categoryName || budgetInput?.name || 'Orçamento';

    return {
        meta: {
            appName: appName || EMAIL_FROM_NAME,
            organizationName: organizationName || appName || EMAIL_FROM_NAME,
            routePath: links.relativePath,
            baseUrl: links.url
        },
        user: {
            id: user?.id ?? null,
            name: user?.name || '',
            firstName: extractFirstName(user?.name || budgetInput?.userName || '') || 'Gestor'
        },
        budget: {
            id: budgetId,
            categoryName,
            monthLabel,
            monthlyLimit,
            monthlyLimitLabel: formatCurrency(monthlyLimit),
            consumption,
            consumptionLabel: formatCurrency(consumption),
            remaining,
            remainingLabel: formatCurrency(Math.abs(remaining)),
            usagePercent,
            usageLabel,
            statusKey: statusMeta.key,
            statusLabel: statusMeta.label,
            statusDescription,
            statusTone,
            metrics,
            thresholdAlert: triggeredThreshold,
            accentColor,
            categoryColor: sanitizeColor(budgetInput?.categoryColor || '#6366f1'),
            highlightMessage: statusDescription
        },
        links: {
            accessUrl: links.url,
            relativePath: links.relativePath,
            token: links.token
        },
        tokens: {
            access: {
                value: links.token,
                issuedAt: links.issuedAt,
                expiresAt: links.expiresAt,
                issuedAtLabel: formatDateLabel(links.issuedAt),
                expiresAtLabel: formatDateLabel(links.expiresAt)
            }
        },
        insights,
        copy: {
            heroTitle: `Orçamento de ${categoryName}`,
            heroSubtitle: statusDescription,
            previewText: `${usageLabel} ${statusDescription}`.trim(),
            ctaLabel: 'Acessar orçamento'
        }
    };
};

const SUBJECT_LEAD_BY_STATUS = Object.freeze({
    healthy: 'Atualização de orçamento',
    caution: 'Atenção ao orçamento',
    warning: 'Alerta de orçamento',
    critical: 'Limite excedido'
});

const buildBudgetAlertSubject = (context, options = {}) => {
    const fallback = options?.fallbackSubject || 'Atualização de orçamento';
    if (!context || !context.budget) {
        return `${fallback} | ${EMAIL_FROM_NAME}`;
    }

    const { budget, meta } = context;
    const lead = SUBJECT_LEAD_BY_STATUS[budget.statusKey] || fallback;
    const monthSegment = budget.monthLabel ? ` — ${budget.monthLabel}` : '';
    const usageSegment = Number.isFinite(budget.usagePercent)
        ? ` (${Math.round(budget.usagePercent)}% utilizado)`
        : '';
    const organizationSegment = meta?.organizationName ? ` | ${meta.organizationName}` : '';

    return `${lead} • ${budget.categoryName}${monthSegment}${usageSegment}${organizationSegment}`;
};

const renderNotificationTemplate = (templateName, context) => {
    const templatePath = path.join(EMAIL_TEMPLATES_DIR, templateName);
    return ejs.renderFile(templatePath, context, TEMPLATE_OPTIONS);
};

const renderBudgetAlertEmail = (context) => renderNotificationTemplate('budgetAlertEmail.ejs', context);

const renderBudgetAlertInApp = (context) => renderNotificationTemplate('budgetAlertInApp.ejs', context);

const buildBudgetAlertEmailPayload = async (budgetInput, options = {}) => {
    const context = buildBudgetAlertContext(budgetInput, options);
    const html = await renderBudgetAlertEmail(context);
    const subject = buildBudgetAlertSubject(context, options);
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    return {
        subject,
        html,
        text,
        context
    };
};

/**
 * Envia e-mail com suporte a HTML e personalizações de cabeçalho.
 * Também permite receber um objeto com as opções completas do Nodemailer.
 *
 * @param {string|string[]} to - destinatário(s)
 * @param {string} subject - assunto do e-mail
 * @param {string|object} payload - texto simples ou objeto com opções do Nodemailer
 * @param {string} [html] - conteúdo em HTML (caso payload seja texto)
 */
async function sendEmail(to, subject, payload, html) {
    try {
        const baseOptions = {
            from: `${EMAIL_FROM_NAME} <${GMAIL_USER}>`,
            to,
            subject
        };

        let mailOptions = { ...baseOptions };

        if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
            mailOptions = { ...baseOptions, ...payload };
        } else {
            mailOptions = {
                ...baseOptions,
                text: payload,
                html: html || undefined
            };
        }

        if (!mailOptions.text && mailOptions.html) {
            mailOptions.text = mailOptions.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }

        if (shouldMockEmail()) {
            console.log(`[EMAIL MOCKADO] ${subject} -> ${to}`);
            return { mocked: true, mailOptions };
        }

        const response = await transporter.sendMail(mailOptions);
        console.log(`E-mail enviado para ${to} com assunto "${subject}"`);
        return response;
    } catch (error) {
        console.error('Erro ao enviar email:', error);
        throw error;
    }
}

/**
 * Envia múltiplos e-mails com controle de taxa e concorrência.
 * Cada item deve possuir as propriedades { to, subject, payload, html }.
 *
 * @param {Array} messages
 * @param {object} options
 */
async function sendBulkEmail(messages = [], options = {}) {
    const jobs = Array.isArray(messages) ? messages.slice() : [];
    const total = jobs.length;

    if (!total) {
        return { sent: 0, total: 0, errors: [] };
    }

    const rateLimit = options.rateLimit || {};
    const maxPerInterval = Number.isFinite(rateLimit.max) && rateLimit.max > 0
        ? Math.floor(rateLimit.max)
        : BULK_DEFAULTS.max;
    const intervalMs = Number.isFinite(rateLimit.intervalMs) && rateLimit.intervalMs > 0
        ? Math.floor(rateLimit.intervalMs)
        : BULK_DEFAULTS.intervalMs;
    const concurrency = Number.isFinite(options.concurrency)
        ? Math.max(1, Math.floor(options.concurrency))
        : Number.isFinite(rateLimit.concurrency)
            ? Math.max(1, Math.floor(rateLimit.concurrency))
            : BULK_DEFAULTS.concurrency;

    const stopOnError = options.stopOnError ?? BULK_DEFAULTS.stopOnError;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const onError = typeof options.onError === 'function' ? options.onError : null;

    let sentInWindow = 0;
    let windowStart = Date.now();
    let sent = 0;
    let aborted = false;
    const errors = [];

    const pullJob = () => {
        if (!jobs.length) return null;
        return jobs.shift();
    };

    const executeJob = async (job) => {
        const now = Date.now();
        if (now - windowStart >= intervalMs) {
            windowStart = now;
            sentInWindow = 0;
        }

        if (sentInWindow >= maxPerInterval) {
            const waitTime = intervalMs - (now - windowStart);
            if (waitTime > 0) {
                await delay(waitTime);
            }
            windowStart = Date.now();
            sentInWindow = 0;
        }

        await sendEmail(job.to, job.subject, job.payload ?? job.text ?? '', job.html);
        sentInWindow += 1;
        sent += 1;
        if (onProgress) {
            onProgress({ sent, total, last: job });
        }
    };

    const worker = async () => {
        while (!aborted) {
            const job = pullJob();
            if (!job) {
                break;
            }

            try {
                await executeJob(job);
            } catch (error) {
                errors.push({ error, job });
                if (onError) {
                    try {
                        await onError(error, job);
                    } catch (hookError) {
                        errors.push({ error: hookError, job });
                    }
                }
                if (stopOnError) {
                    aborted = true;
                    break;
                }
            }
        }
    };

    const workerCount = Math.min(concurrency, total);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    return { sent, total, errors };
}

module.exports = {
    sendEmail,
    sendBulkEmail,
    buildBudgetAlertContext,
    buildBudgetAlertSubject,
    buildBudgetAlertEmailPayload,
    renderBudgetAlertEmail,
    renderBudgetAlertInApp,
    buildBudgetAccessLink
};
