'use strict';

const { TICKET_STATUSES } = require('../constants/support');

const STATUS_LABELS = Object.freeze({
    [TICKET_STATUSES.PENDING]: 'Pendente',
    [TICKET_STATUSES.IN_PROGRESS]: 'Em andamento',
    [TICKET_STATUSES.RESOLVED]: 'Resolvido'
});

const PRIORITY_LABELS = Object.freeze({
    low: 'Baixa',
    medium: 'Média',
    high: 'Alta',
    urgent: 'Urgente'
});

const DEFAULT_DATETIME_OPTIONS = Object.freeze({
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
});

const normalizeString = (value) => {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim().toLowerCase();
    return normalized || null;
};

const normalizeTicketStatus = (status) => {
    const normalized = normalizeString(status);
    if (!normalized) {
        return null;
    }

    if (STATUS_LABELS[normalized]) {
        return normalized;
    }

    return null;
};

const normalizeTicketPriority = (priority) => {
    const normalized = normalizeString(priority);
    if (!normalized) {
        return null;
    }

    if (PRIORITY_LABELS[normalized]) {
        return normalized;
    }

    return null;
};

const getTicketStatusLabel = (status) => {
    const normalized = normalizeTicketStatus(status);
    return STATUS_LABELS[normalized] || 'Status não informado';
};

const getTicketPriorityLabel = (priority) => {
    const normalized = normalizeTicketPriority(priority);
    return PRIORITY_LABELS[normalized] || 'Não informado';
};

const formatSupportDateTime = (input, options = {}) => {
    if (!input) {
        return null;
    }

    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    try {
        const formatter = new Intl.DateTimeFormat('pt-BR', {
            ...DEFAULT_DATETIME_OPTIONS,
            ...options
        });
        return formatter.format(date);
    } catch (error) {
        return date.toISOString();
    }
};

const buildTicketPresentation = (ticket = {}) => {
    const normalizedStatus = normalizeTicketStatus(ticket.status) || ticket.status || null;
    const normalizedPriority = normalizeTicketPriority(ticket.priority) || ticket.priority || null;

    return {
        status: normalizedStatus,
        statusLabel: getTicketStatusLabel(normalizedStatus),
        priority: normalizedPriority,
        priorityLabel: getTicketPriorityLabel(normalizedPriority),
        createdAtFormatted: formatSupportDateTime(ticket.createdAt),
        updatedAtFormatted: formatSupportDateTime(ticket.updatedAt),
        lastMessageAtFormatted: formatSupportDateTime(ticket.lastMessageAt),
        firstResponseAtFormatted: formatSupportDateTime(ticket.firstResponseAt),
        resolvedAtFormatted: formatSupportDateTime(ticket.resolvedAt),
        attachmentCount: Array.isArray(ticket.attachments) ? ticket.attachments.length : 0
    };
};

module.exports = {
    STATUS_LABELS,
    PRIORITY_LABELS,
    normalizeTicketStatus,
    normalizeTicketPriority,
    getTicketStatusLabel,
    getTicketPriorityLabel,
    formatSupportDateTime,
    buildTicketPresentation
};

