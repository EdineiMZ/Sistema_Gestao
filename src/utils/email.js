// src/utils/email.js
const nodemailer = require('nodemailer');

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

const BULK_DEFAULTS = Object.freeze({
    max: 90,
    intervalMs: 60_000,
    concurrency: 2,
    stopOnError: false
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    sendBulkEmail
};
