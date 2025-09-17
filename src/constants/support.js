'use strict';

const sanitize = require('sanitize-html');
const { USER_ROLES, roleAtLeast } = require('./roles');

const TICKET_STATUSES = Object.freeze({
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    RESOLVED: 'resolved'
});

const TICKET_STATUS_VALUES = Object.freeze(Object.values(TICKET_STATUSES));

const SUPPORT_AGENT_MIN_ROLE = USER_ROLES.COLLABORATOR;

const isSupportAgentRole = (role) => roleAtLeast(role, SUPPORT_AGENT_MIN_ROLE);

const sanitizeSupportContent = (value) => {
    if (!value) {
        return '';
    }

    return sanitize(value, {
        allowedTags: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'code'],
        allowedAttributes: {
            code: ['class']
        },
        allowedSchemes: ['http', 'https', 'mailto']
    }).trim();
};

module.exports = {
    TICKET_STATUSES,
    TICKET_STATUS_VALUES,
    SUPPORT_AGENT_MIN_ROLE,
    isSupportAgentRole,
    sanitizeSupportContent
};
