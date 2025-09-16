// src/utils/email.js
const nodemailer = require('nodemailer');

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_PASS;
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

module.exports = {
    sendEmail
};
