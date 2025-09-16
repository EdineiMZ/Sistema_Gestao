const { ROLE_LABELS, parseRole } = require('../constants/roles');

const formatCurrencyBRL = (value) => {
    if (value === undefined || value === null || value === '') {
        return '';
    }
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
        return '';
    }
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(parsed);
};

const formatDate = (value, options = {}) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        ...options
    }).format(date);
};

const formatDateTime = (value) => formatDate(value, { dateStyle: 'short', timeStyle: 'short' });
const formatTime = (value) => formatDate(value, { hour: '2-digit', minute: '2-digit' });

const buildRoleLabel = (role) => {
    const resolved = parseRole(role, null);
    if (!resolved) {
        return 'Usuário';
    }
    return ROLE_LABELS[resolved] || 'Usuário';
};

const baseTemplate = ({ title, body, accentColor, previewText }) => {
    const preview = previewText
        ? `<span style="display:none;color:transparent;height:0;max-height:0;opacity:0;overflow:hidden;">${previewText}</span>`
        : '';
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fb; margin: 0; padding: 0; color: #222; }
        .wrapper { width: 100%; padding: 24px 0; }
        .container { max-width: 640px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 20px 45px rgba(16, 24, 40, 0.1); overflow: hidden; }
        .header { background: ${accentColor}; color: #ffffff; padding: 32px 32px 24px; }
        .header h1 { margin: 0; font-size: 26px; font-weight: 600; }
        .body { padding: 32px; line-height: 1.6; }
        .body p { margin-bottom: 16px; }
        .footer { padding: 24px 32px 32px; background: #f0f2f8; font-size: 13px; color: #4b5563; }
        .cta-button { display: inline-block; margin-top: 16px; padding: 12px 24px; background: ${accentColor}; color: #ffffff !important; text-decoration: none; border-radius: 999px; font-weight: 600; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .cta-button:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(13, 110, 253, 0.25); }
        @media (max-width: 600px) {
            .container { margin: 0 16px; }
            .body { padding: 24px; }
            .header, .footer { padding: 24px; }
        }
    </style>
</head>
<body>
    ${preview}
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <h1>${title}</h1>
            </div>
            <div class="body">
                ${body}
            </div>
            <div class="footer">
                <p>Mensagem automática do sistema de gestão. Não responda este e-mail.</p>
            </div>
        </div>
    </div>
</body>
</html>`;
};

const replacePlaceholders = (template = '', user, appointment, extras = {}) => {
    if (!template) return '';
    let message = String(template);

    const now = new Date();
    const safeReplace = (pattern, value) => {
        const finalValue = value ?? '';
        message = message.replace(new RegExp(pattern, 'g'), finalValue);
    };

    const professional = appointment?.professional;
    const procedure = appointment?.procedure;
    const room = appointment?.room;

    safeReplace('%DATA_ATUAL%', formatDate(now, { dateStyle: 'long' }));
    safeReplace('%HORA_ATUAL%', formatTime(now));

    safeReplace('%USUARIO%', user?.name ?? extras.fallbackName ?? '');
    safeReplace('%USER_FIRST_NAME%', user?.name ? user.name.split(' ')[0] : (extras.fallbackName ? extras.fallbackName.split(' ')[0] : ''));
    safeReplace('%USER_EMAIL%', user?.email ?? '');
    safeReplace('%USER_PHONE%', user?.phone ?? '');
    safeReplace('%USER_CREDIT%', user?.creditBalance !== undefined ? formatCurrencyBRL(user.creditBalance) : '');
    safeReplace('%USER_FUNCAO%', buildRoleLabel(user?.role));

    safeReplace('%AGENDAMENTO_DESCRICAO%', appointment?.description ?? '');
    safeReplace('%AGENDAMENTO_DATA%', formatDate(appointment?.start, { dateStyle: 'long' }));
    safeReplace('%AGENDAMENTO_INICIO%', formatDateTime(appointment?.start));
    safeReplace('%AGENDAMENTO_HORA_INICIO%', formatTime(appointment?.start));
    safeReplace('%AGENDAMENTO_HORA_FIM%', formatTime(appointment?.end));
    safeReplace('%AGENDAMENTO_STATUS%', appointment?.status ?? '');
    safeReplace('%AGENDAMENTO_CLIENTE_EMAIL%', appointment?.clientEmail ?? '');
    safeReplace('%AGENDAMENTO_PROCEDIMENTO%', procedure?.name ?? extras.procedureName ?? '');
    safeReplace('%AGENDAMENTO_SALA%', room?.name ?? extras.roomName ?? '');
    safeReplace('%AGENDAMENTO_PROFISSIONAL%', professional?.name ?? extras.professionalName ?? '');
    safeReplace('%AGENDAMENTO_PROFISSIONAL_EMAIL%', professional?.email ?? '');
    safeReplace('%AGENDAMENTO_VALOR%', procedure?.price ? formatCurrencyBRL(procedure.price) : '');

    if (extras.organizationName) {
        safeReplace('%ORGANIZACAO%', extras.organizationName);
    }
    if (extras.customMessage) {
        safeReplace('%MENSAGEM_EXTRA%', extras.customMessage);
    }

    return message;
};

const buildEmailContent = (notification, context = {}) => {
    const { user, appointment, extras = {} } = context;
    const accentColor = notification.accentColor || '#0d6efd';

    const subject = replacePlaceholders(notification.title, user, appointment, extras) || notification.title;
    const textBody = replacePlaceholders(notification.message, user, appointment, extras);

    let htmlBody = notification.messageHtml
        ? replacePlaceholders(notification.messageHtml, user, appointment, extras)
        : `<p>${textBody.replace(/\n/g, '<br />')}</p>`;

    const previewText = notification.previewText
        ? replacePlaceholders(notification.previewText, user, appointment, extras)
        : textBody.slice(0, 120);

    const html = baseTemplate({
        title: subject,
        body: htmlBody,
        accentColor,
        previewText
    });

    return {
        subject,
        text: textBody,
        html,
        previewText
    };
};

module.exports = {
    replacePlaceholders,
    buildEmailContent,
    buildRoleLabel
};
