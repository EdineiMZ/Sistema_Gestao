// src/utils/placeholderUtils.js

function replacePlaceholders(template, user, appointment) {
    let msg = template;
    if (user) {
        msg = msg.replace(/%USUARIO%/g, user.name || '');
        msg = msg.replace(/%USER_EMAIL%/g, user.email || '');
    }
    if (appointment) {
        msg = msg.replace(/%AGENDAMENTO_NOME%/g, appointment.description || '');
        // etc. se tiver mais placeholders
    }
    return msg;
}

module.exports = {
    replacePlaceholders
};
