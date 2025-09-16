// src/utils/email.js
const nodemailer = require('nodemailer');

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_PASS;

// Cria o transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: GMAIL_USER,
        pass: GMAIL_PASS
    }
});

/**
 * Função para enviar e-mail de forma simples
 * @param {string} to  - destinatário
 * @param {string} subject - assunto
 * @param {string} text - texto ou corpo do e-mail
 * @param {string} [html] - se quiser enviar em HTML
 */
async function sendEmail(to, subject, text, html) {
    try {
        const mailOptions = {
            from: GMAIL_USER,  // ou outro e-mail
            to,
            subject,
            text
        };
        if (html) {
            mailOptions.html = html;
        }

        await transporter.sendMail(mailOptions);
        console.log(`E-mail enviado para ${to} com assunto "${subject}"`);
    } catch (error) {
        console.error('Erro ao enviar email:', error);
    }
}

module.exports = {
    sendEmail
};
