const config = window.supportChatConfig || {};

const elements = {
    panel: document.querySelector('[data-chat-panel]'),
    messageList: document.querySelector('[data-chat-messages]'),
    emptyState: document.querySelector('[data-chat-empty]'),
    agentStatus: document.querySelector('[data-agent-status]'),
    form: document.querySelector('[data-chat-form]'),
    messageInput: document.querySelector('#supportChatMessage'),
    uploadButton: document.querySelector('[data-chat-upload] input[type="file"]'),
    attachmentForm: document.querySelector('[data-attachment-form]'),
    attachmentsContainer: document.querySelector('[data-support-attachments]'),
    adminEntryButton: document.querySelector('[data-enter-as-admin]')
};

const initialPermissions = config && typeof config.permissions === 'object'
    ? { ...config.permissions }
    : {};

const state = {
    ticketId: config.ticketId,
    permissions: initialPermissions,
    isAdmin: Boolean(initialPermissions.isAdmin || config?.user?.role === 'admin'),
    isAgent: Boolean(initialPermissions.isAgent),
    isAssigned: Boolean(initialPermissions.isAssigned),
    isOwner: Boolean(initialPermissions.isOwner),
    joined: false,
    joining: false,
    asAdmin: false,
    attachments: Array.isArray(config.attachments) ? [...config.attachments] : [],
    messages: Array.isArray(config.history) ? [...config.history] : [],
    pendingFile: null
};

const socket = typeof io === 'function' ? io() : null;

const getAttachmentName = (attachment) => {
    if (!attachment) {
        return 'arquivo';
    }

    return attachment.fileName || attachment.originalName || 'arquivo';
};

const getAttachmentSize = (attachment) => {
    if (!attachment) {
        return 0;
    }

    const size = Number(attachment.fileSize ?? attachment.size ?? 0);
    return Number.isFinite(size) && size >= 0 ? size : 0;
};

const formatTime = (value) => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
    });
};

const toggleEmptyState = () => {
    if (!elements.emptyState || !elements.messageList) {
        return;
    }

    if (!state.messages.length) {
        elements.emptyState.classList.remove('d-none');
    } else {
        elements.emptyState.classList.add('d-none');
    }
};

const renderMessage = (message) => {
    if (!elements.messageList || !message) {
        return;
    }

    const isCurrentUser = Boolean(config.user && message.senderId === config.user.id);
    const isAgent = Boolean(message.isFromAgent);
    const isSystem = Boolean(message.isSystem);

    const resolveAuthorLabel = () => {
        if (isSystem) {
            return 'Sistema';
        }

        if (message.sender && message.sender.name) {
            return message.sender.name;
        }

        if (isCurrentUser) {
            return 'Você';
        }

        if (isAgent) {
            return 'Equipe de suporte';
        }

        return 'Usuário';
    };

    const li = document.createElement('li');
    li.className = 'support-chat__message-wrapper d-flex flex-column';

    const bubble = document.createElement('div');
    bubble.classList.add('support-chat__message');

    if (isSystem) {
        bubble.classList.add('support-chat__message--system', 'bg-dark', 'bg-opacity-75', 'text-white');
    } else if (isCurrentUser) {
        bubble.classList.add('support-chat__message--self');
    } else {
        bubble.classList.add('support-chat__message--other');
    }

    const header = document.createElement('div');
    header.className = 'd-flex align-items-center justify-content-between gap-2 mb-1';

    const author = document.createElement('span');
    author.className = 'fw-semibold small text-uppercase';
    author.textContent = resolveAuthorLabel();

    const timestamp = document.createElement('small');
    timestamp.textContent = formatTime(message.createdAt);

    header.append(author, timestamp);
    bubble.append(header);

    if (message.body) {
        const body = document.createElement('div');
        body.className = 'mb-2';
        if (/<[a-z][\s\S]*>/i.test(message.body)) {
            body.innerHTML = message.body;
        } else {
            body.textContent = message.body;
        }
        bubble.append(body);
    }

    if (message.attachment) {
        const attachmentLink = document.createElement('a');
        attachmentLink.href = `/support/attachments/${message.attachment.id}/download`;
        attachmentLink.className = 'd-inline-flex align-items-center gap-2 small fw-semibold';
        attachmentLink.innerHTML = `<i class="bi bi-paperclip"></i> ${getAttachmentName(message.attachment)}`;
        bubble.append(attachmentLink);
    }

    li.append(bubble);
    elements.messageList.append(li);
    elements.messageList.scrollTop = elements.messageList.scrollHeight;
};

const renderMessages = () => {
    if (!elements.messageList) {
        return;
    }

    elements.messageList.innerHTML = '';
    state.messages.forEach(renderMessage);
    toggleEmptyState();
};

const renderAttachments = () => {
    if (!elements.attachmentsContainer) {
        return;
    }

    if (!state.attachments.length) {
        elements.attachmentsContainer.innerHTML = '<p class="text-muted small mb-0">Nenhum anexo adicionado ainda.</p>';
        return;
    }

    const list = document.createElement('ul');
    list.className = 'list-unstyled mb-0 d-flex flex-column gap-2';

    state.attachments.forEach((attachment) => {
        const item = document.createElement('li');
        item.className = 'attachment-item d-flex align-items-center gap-3';
        item.dataset.attachmentId = attachment.id;

        const sizeKb = (getAttachmentSize(attachment) / 1024).toFixed(1);

        item.innerHTML = `
            <span class="attachment-icon bg-primary-subtle text-primary"><i class="bi bi-paperclip"></i></span>
            <div class="flex-grow-1">
                <a class="text-decoration-none fw-semibold" href="/support/attachments/${attachment.id}/download">
                    ${getAttachmentName(attachment)}
                </a>
                <small class="text-muted d-block">Tamanho: ${sizeKb} KB</small>
            </div>
        `;

        list.append(item);
    });

    elements.attachmentsContainer.innerHTML = '';
    elements.attachmentsContainer.append(list);
};

const setAgentStatus = (message, variant = 'success') => {
    if (!elements.agentStatus) {
        return;
    }

    elements.agentStatus.textContent = message;
    elements.agentStatus.className = `badge rounded-pill bg-${variant}-subtle text-${variant}`;
};

const joinChat = (asAdmin = false) => {
    if (!socket || state.joining || state.joined) {
        return;
    }

    state.joining = true;
    socket.emit('support:join', { ticketId: state.ticketId, asAdmin }, (response) => {
        state.joining = false;

        if (!response?.ok) {
            alert('Não foi possível entrar no chat: ' + (response?.error || 'erro desconhecido'));
            return;
        }

        state.joined = true;
        state.asAdmin = Boolean(asAdmin);
        state.messages = Array.isArray(response.history) ? response.history : [];
        refreshPermissionState(response.permissions);
        updateAdminButtonVisibility();
        renderMessages();
        setAgentStatus(state.asAdmin ? 'Administrador conectado' : 'Canal disponível', state.asAdmin ? 'primary' : 'success');

        if (elements.adminEntryButton) {
            elements.adminEntryButton.classList.add('d-none');
        }
    });
};

const sendMessage = async (content, attachmentFile) => {
    if (!socket || !state.joined) {
        alert('Conexão com o chat ainda não estabelecida.');
        return;
    }

    let attachmentId = null;

    if (attachmentFile) {
        const formData = new FormData();
        formData.append('file', attachmentFile);

        const response = await fetch(`/support/tickets/${state.ticketId}/attachments`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Falha ao enviar anexo.' }));
            throw new Error(errorData.message || 'Erro ao enviar anexo.');
        }

        const data = await response.json();
        if (data?.attachment) {
            attachmentId = data.attachment.id;
            state.attachments.push(data.attachment);
            renderAttachments();
        }
    }

    return new Promise((resolve, reject) => {
        socket.emit(
            'support:message',
            {
                ticketId: state.ticketId,
                body: content,
                attachmentId
            },
            (ack) => {
                if (!ack?.ok) {
                    reject(new Error(ack?.error || 'Erro ao enviar mensagem.'));
                    return;
                }

                resolve(ack.message);
            }
        );
    });
};

const handleFormSubmit = async (event) => {
    event.preventDefault();
    if (!elements.messageInput) {
        return;
    }

    const content = elements.messageInput.value.trim();
    const file = state.pendingFile;

    if (!content && !file) {
        return;
    }

    try {
        elements.form.classList.add('is-loading');
        await sendMessage(content, file);
        elements.messageInput.value = '';
        if (elements.uploadButton) {
            elements.uploadButton.value = '';
        }
        state.pendingFile = null;
    } catch (error) {
        alert(error.message || 'Erro ao enviar mensagem.');
    } finally {
        elements.form.classList.remove('is-loading');
    }
};

const handleAttachmentSubmit = async (event) => {
    event.preventDefault();
    const input = event.currentTarget?.querySelector('input[type="file"]');
    if (!input || !input.files?.length) {
        return;
    }

    const file = input.files[0];
    const formData = new FormData();
    formData.append('file', file);

    try {
        event.currentTarget.classList.add('is-loading');
        const response = await fetch(`/support/tickets/${state.ticketId}/attachments`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Falha ao enviar anexo.' }));
            throw new Error(errorData.message || 'Erro ao anexar arquivo.');
        }

        const data = await response.json();
        if (data?.attachment) {
            state.attachments.push(data.attachment);
            renderAttachments();
        }
        input.value = '';
    } catch (error) {
        alert(error.message || 'Erro ao anexar arquivo.');
    } finally {
        event.currentTarget.classList.remove('is-loading');
    }
};

const bindEvents = () => {
    if (elements.form) {
        elements.form.addEventListener('submit', handleFormSubmit);
    }

    if (elements.uploadButton) {
        elements.uploadButton.addEventListener('change', (event) => {
            state.pendingFile = event.target.files?.[0] || null;
        });
    }

    if (elements.attachmentForm) {
        elements.attachmentForm.addEventListener('submit', handleAttachmentSubmit);
    }

    if (elements.adminEntryButton) {
        elements.adminEntryButton.addEventListener('click', (event) => {
            event.preventDefault();
            if (!state.isAdmin) {
                return;
            }

            joinChat(true);
            fetch(`/support/tickets/${state.ticketId}/notify-admin-entry`, {
                method: 'POST'
            }).catch(() => {
                // Notificar falha silenciosa para não interromper fluxo.
            });
        });

        updateAdminButtonVisibility();
    }
};

const bindSocketEvents = () => {
    if (!socket) {
        return;
    }

    socket.on('connect', () => {
        if (state.isAdmin) {
            if (state.asAdmin) {
                joinChat(true);
            }
        } else {
            joinChat(false);
        }
    });

    socket.on('support:message', (message) => {
        state.messages.push(message);
        renderMessage(message);
        toggleEmptyState();
    });

    socket.on('support:agent:online', () => {
        setAgentStatus('Administrador conectado', 'primary');
    });

    socket.on('disconnect', () => {
        state.joined = false;
        state.joining = false;

        if (elements.adminEntryButton) {
            updateAdminButtonVisibility();
        }
    });
};

const init = () => {
    if (!state.ticketId || !socket) {
        return;
    }

    renderMessages();
    renderAttachments();
    toggleEmptyState();
    bindEvents();
    bindSocketEvents();

    if (state.isAdmin && !elements.adminEntryButton) {
        joinChat(true);
        fetch(`/support/tickets/${state.ticketId}/notify-admin-entry`, {
            method: 'POST'
        }).catch(() => {});
    }
};

init();
const refreshPermissionState = (permissions = {}) => {
    if (!permissions || typeof permissions !== 'object') {
        return;
    }

    state.permissions = { ...state.permissions, ...permissions };
    state.isAdmin = Boolean(state.permissions.isAdmin || config?.user?.role === 'admin');
    state.isAgent = Boolean(state.permissions.isAgent);
    state.isAssigned = Boolean(state.permissions.isAssigned);
    state.isOwner = Boolean(state.permissions.isOwner);
};

const updateAdminButtonVisibility = () => {
    if (!elements.adminEntryButton) {
        return;
    }

    if (state.isAdmin) {
        elements.adminEntryButton.classList.remove('d-none');
    } else {
        elements.adminEntryButton.classList.add('d-none');
    }
};

