const initializeSupportChatbot = () => {
    const config = window.supportChatbotConfig;
    if (!config || !Array.isArray(config.topics)) {
        return;
    }

    const assistantElement = document.querySelector('[data-chatbot-assistant]');
    if (!assistantElement) {
        return;
    }

    const selectField = assistantElement.querySelector('[data-chatbot-select]');
    const responseContainer = assistantElement.querySelector('[data-chatbot-response]');
    const responseTitle = assistantElement.querySelector('[data-chatbot-response-title]');
    const responseSummary = assistantElement.querySelector('[data-chatbot-summary]');
    const stepsList = assistantElement.querySelector('[data-chatbot-steps]');
    const expectedAlert = assistantElement.querySelector('[data-chatbot-expected]');
    const escalationAlert = assistantElement.querySelector('[data-chatbot-escalation]');
    const detailsField = assistantElement.querySelector('[data-chatbot-details]');
    const openChatButton = assistantElement.querySelector('[data-chatbot-open-chat]');
    const openChatLabel = assistantElement.querySelector('[data-chatbot-open-chat-label]');
    const loadingIndicator = assistantElement.querySelector('[data-chatbot-loading]');
    const statusMessage = assistantElement.querySelector('[data-chatbot-status]');

    const topicsMap = new Map(config.topics.map((topic) => [topic.id, topic]));

    const resetAssistantState = () => {
        if (responseContainer) {
            responseContainer.classList.add('d-none');
        }
        if (stepsList) {
            stepsList.innerHTML = '';
        }
        if (responseSummary) {
            responseSummary.textContent = '';
        }
        if (responseTitle) {
            responseTitle.textContent = '';
        }
        if (expectedAlert) {
            expectedAlert.classList.add('d-none');
            expectedAlert.textContent = '';
        }
        if (escalationAlert) {
            escalationAlert.classList.add('d-none');
            escalationAlert.textContent = '';
        }
        if (statusMessage) {
            statusMessage.textContent = '';
        }
        if (openChatButton) {
            openChatButton.disabled = true;
        }
    };

    const renderTopicSolution = (topic) => {
        if (!topic) {
            resetAssistantState();
            return;
        }

        if (responseTitle) {
            responseTitle.textContent = topic.title;
        }

        if (responseSummary) {
            responseSummary.textContent = topic.summary || 'Siga as etapas sugeridas abaixo.';
        }

        if (stepsList) {
            stepsList.innerHTML = '';
            if (Array.isArray(topic.steps) && topic.steps.length) {
                topic.steps.forEach((step, index) => {
                    const item = document.createElement('li');
                    item.className = 'list-group-item';
                    const label = document.createElement('span');
                    label.className = 'fw-semibold text-primary me-2';
                    label.textContent = `Etapa ${index + 1}`;
                    const description = document.createElement('span');
                    description.className = 'text-muted';
                    description.textContent = step;
                    item.append(label, description);
                    stepsList.appendChild(item);
                });
            } else {
                const emptyItem = document.createElement('li');
                emptyItem.className = 'list-group-item text-muted';
                emptyItem.textContent = 'Nenhum passo cadastrado para este tópico.';
                stepsList.appendChild(emptyItem);
            }
        }

        if (expectedAlert) {
            if (topic.expectedResult) {
                expectedAlert.textContent = topic.expectedResult;
                expectedAlert.classList.remove('d-none');
            } else {
                expectedAlert.classList.add('d-none');
                expectedAlert.textContent = '';
            }
        }

        if (escalationAlert) {
            if (topic.escalationMessage) {
                escalationAlert.textContent = topic.escalationMessage;
                escalationAlert.classList.remove('d-none');
            } else {
                escalationAlert.classList.add('d-none');
                escalationAlert.textContent = '';
            }
        }

        if (responseContainer) {
            responseContainer.classList.remove('d-none');
        }

        if (openChatButton) {
            openChatButton.disabled = false;
        }
    };

    const toggleLoading = (isLoading) => {
        if (!openChatButton) {
            return;
        }

        openChatButton.disabled = isLoading || !selectField?.value;

        if (loadingIndicator) {
            if (isLoading) {
                loadingIndicator.classList.remove('d-none');
            } else {
                loadingIndicator.classList.add('d-none');
            }
        }

        if (openChatLabel) {
            if (isLoading) {
                openChatLabel.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Conectando...';
            } else {
                openChatLabel.innerHTML = '<i class="bi bi-headset me-2"></i>Falar com suporte humano';
            }
        }
    };

    const handleTopicChange = () => {
        const topicId = selectField?.value;
        const topic = topicId ? topicsMap.get(topicId) : null;
        renderTopicSolution(topic);
    };

    const handleOpenChat = async () => {
        if (!selectField) {
            return;
        }

        const topicId = selectField.value;
        if (!topicId || !topicsMap.has(topicId) || !config.startChatUrl) {
            return;
        }

        toggleLoading(true);
        if (statusMessage) {
            statusMessage.textContent = 'Conectando com um especialista...';
        }

        try {
            const payload = {
                topicId,
                details: detailsField ? detailsField.value : ''
            };

            const response = await fetch(config.startChatUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error('Falha ao iniciar atendimento');
            }

            const data = await response.json();
            if (statusMessage) {
                statusMessage.textContent = data.message || 'Chamado criado. Redirecionando...';
            }

            if (data && data.chatUrl) {
                setTimeout(() => {
                    window.location.href = data.chatUrl;
                }, 800);
            }
        } catch (error) {
            console.error('Erro ao abrir chat com suporte:', error);
            if (statusMessage) {
                statusMessage.textContent = 'Não foi possível iniciar o chat ao vivo. Tente novamente em instantes.';
            }
            toggleLoading(false);
        }
    };

    if (selectField) {
        selectField.addEventListener('change', () => {
            toggleLoading(false);
            handleTopicChange();
        });
    }

    if (openChatButton) {
        openChatButton.addEventListener('click', handleOpenChat);
    }

    resetAssistantState();
};

document.addEventListener('DOMContentLoaded', initializeSupportChatbot);
