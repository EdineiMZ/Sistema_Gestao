(function () {
    const STATE_ELEMENT_ID = 'financePaymentsState';

    const parseStateElement = () => {
        const element = document.getElementById(STATE_ELEMENT_ID);
        if (!element) {
            return {};
        }
        try {
            const raw = element.textContent || element.innerText || '{}';
            return JSON.parse(raw);
        } catch (error) {
            console.warn('Não foi possível interpretar o estado inicial de pagamentos.', error);
            return {};
        }
    };

    const buildFiltersQuery = (scope) => {
        const params = new URLSearchParams(window.location.search || '');
        const forms = scope ? [scope] : Array.from(document.querySelectorAll('[data-filter-form]'));

        forms.filter(Boolean).forEach((form) => {
            const fields = form.querySelectorAll('input[name], select[name], textarea[name]');
            fields.forEach((field) => {
                if (!field || !field.name) {
                    return;
                }
                const rawValue = typeof field.value === 'string' ? field.value.trim() : field.value;
                if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
                    params.set(field.name, rawValue);
                } else {
                    params.delete(field.name);
                }
            });
        });

        return params.toString();
    };

    const submitFormWithFilters = (form) => {
        if (!form) {
            return;
        }
        const action = form.getAttribute('action') || window.location.pathname || '/finance/payments';
        const queryString = buildFiltersQuery(form);
        const finalUrl = queryString ? `${action}?${queryString}` : action;
        window.location.assign(finalUrl);
    };

    const applyQueryToLink = (link) => {
        if (!link) {
            return;
        }
        const baseUrl = link.getAttribute('data-export-target');
        if (!baseUrl) {
            return;
        }
        const queryString = buildFiltersQuery();
        const finalUrl = queryString ? `${baseUrl}?${queryString}` : baseUrl;
        link.setAttribute('href', finalUrl);
    };

    const refreshExportLinks = (links) => {
        if (!links || !links.length) {
            return;
        }
        links.forEach((link) => {
            applyQueryToLink(link);
            if (!link.__financeExportListenersBound) {
                link.addEventListener('focus', () => applyQueryToLink(link));
                link.addEventListener('mouseenter', () => applyQueryToLink(link));
                link.addEventListener('click', () => applyQueryToLink(link));
                link.addEventListener('auxclick', (event) => {
                    if (event.button === 1) {
                        applyQueryToLink(link);
                    }
                });
                link.__financeExportListenersBound = true;
            }
        });
    };

    const formatChartMonthLabel = (value) => {
        if (!value) {
            return '';
        }
        const safeValue = String(value);
        const isoDate = `${safeValue}-01T00:00:00`;
        const parsed = new Date(isoDate);
        if (Number.isFinite(parsed.getTime())) {
            return parsed.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
        }
        const parts = safeValue.split('-');
        if (parts.length === 2) {
            return `${parts[1]}/${parts[0]}`;
        }
        return safeValue;
    };

    const renderFinanceChart = (canvas, monthlySummary = []) => {
        if (!canvas || !monthlySummary.length || typeof window.Chart === 'undefined') {
            return;
        }
        const context = canvas.getContext('2d');
        if (!context) {
            return;
        }
        const labels = monthlySummary.map((item) => formatChartMonthLabel(item.month));
        const receivableData = monthlySummary.map((item) => Number.parseFloat(item?.receivable ?? 0) || 0);
        const payableData = monthlySummary.map((item) => Number.parseFloat(item?.payable ?? 0) || 0);

        if (canvas.__financeChartInstance) {
            canvas.__financeChartInstance.destroy();
        }

        const currencyFormatter = new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });

        canvas.__financeChartInstance = new window.Chart(context, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'A receber',
                        data: receivableData,
                        borderColor: '#198754',
                        backgroundColor: 'rgba(25, 135, 84, 0.15)',
                        tension: 0.35,
                        fill: true,
                        pointRadius: 4,
                        pointBackgroundColor: '#198754'
                    },
                    {
                        label: 'A pagar',
                        data: payableData,
                        borderColor: '#dc3545',
                        backgroundColor: 'rgba(220, 53, 69, 0.15)',
                        tension: 0.35,
                        fill: true,
                        pointRadius: 4,
                        pointBackgroundColor: '#dc3545'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: (contextItem) => {
                                const value = Number.isFinite(contextItem.parsed?.y) ? contextItem.parsed.y : 0;
                                return `${contextItem.dataset.label}: ${currencyFormatter.format(value)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => currencyFormatter.format(Number(value) || 0)
                        }
                    }
                }
            }
        });
    };

    const setupImportToggle = () => {
        const masterCheckbox = document.querySelector('[data-import-select-all]');
        if (!masterCheckbox) {
            return;
        }
        const rowCheckboxes = Array.from(document.querySelectorAll('input[name^="entries["][name$="[enabled]"]'));
        masterCheckbox.addEventListener('change', (event) => {
            rowCheckboxes.forEach((checkbox) => {
                checkbox.checked = event.target.checked;
            });
        });
    };

    const formatFileSize = (bytes) => {
        const size = Number(bytes);
        if (!Number.isFinite(size) || size <= 0) {
            return '—';
        }
        if (size >= 1024 * 1024) {
            return `${(size / (1024 * 1024)).toFixed(1)} MB`;
        }
        return `${Math.max(1, Math.round(size / 1024))} KB`;
    };

    const decodeAttachmentData = (value) => {
        if (!value) {
            return [];
        }
        try {
            const decoded = decodeURIComponent(value);
            const parsed = JSON.parse(decoded);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.warn('Não foi possível interpretar anexos do lançamento.', error);
            return [];
        }
    };

    const hydrateAttachmentsList = (container, attachments) => {
        if (!container) {
            return;
        }
        container.innerHTML = '';

        if (!Array.isArray(attachments) || !attachments.length) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'text-muted small mb-0';
            emptyMessage.textContent = 'Nenhum anexo disponível para este lançamento.';
            container.appendChild(emptyMessage);
            return;
        }

        const list = document.createElement('ul');
        list.className = 'list-group list-group-flush rounded shadow-sm';

        attachments.forEach((attachment) => {
            const listItem = document.createElement('li');
            listItem.className = 'list-group-item d-flex align-items-center justify-content-between gap-3';

            const info = document.createElement('div');
            info.className = 'd-flex align-items-center gap-2 text-truncate';

            const icon = document.createElement('i');
            icon.className = 'bi bi-paperclip text-primary';
            icon.setAttribute('aria-hidden', 'true');
            info.appendChild(icon);

            const name = document.createElement('span');
            name.className = 'text-truncate';
            const label = typeof attachment?.fileName === 'string' && attachment.fileName.trim()
                ? attachment.fileName.trim()
                : 'Documento';
            name.textContent = label;
            name.title = label;
            info.appendChild(name);

            listItem.appendChild(info);

            const actions = document.createElement('div');
            actions.className = 'd-flex flex-column flex-sm-row align-items-sm-center gap-2 text-sm-end';

            const sizeLabel = document.createElement('span');
            sizeLabel.className = 'text-muted small';
            sizeLabel.textContent = formatFileSize(attachment?.size);
            actions.appendChild(sizeLabel);

            if (attachment && attachment.id) {
                const link = document.createElement('a');
                link.className = 'btn btn-outline-primary btn-sm';
                link.href = `/finance/attachments/${attachment.id}/download`;
                link.innerHTML = '<i class="bi bi-download me-1" aria-hidden="true"></i>Baixar';
                actions.appendChild(link);
            }

            listItem.appendChild(actions);
            list.appendChild(listItem);
        });

        container.appendChild(list);
    };

    const registerEntryModal = () => {
        const modalElement = document.getElementById('financeEntryModal');
        if (!modalElement) {
            return;
        }

        const modalForm = modalElement.querySelector('[data-modal-form]');
        const modalTitle = modalElement.querySelector('[data-modal-title]');
        const attachmentsContainer = modalElement.querySelector('[data-modal-attachments]');
        const triggers = document.querySelectorAll('[data-entry-edit]');

        const setFieldValue = (fieldName, value) => {
            if (!modalForm) {
                return;
            }
            const field = modalForm.querySelector(`[data-modal-field="${fieldName}"]`);
            if (!field) {
                return;
            }
            const normalized = value === null || value === undefined ? '' : String(value);
            field.value = normalized;
        };

        const hydrateModal = (trigger) => {
            if (!trigger || !modalForm) {
                return;
            }

            const entryId = trigger.getAttribute('data-entry-id');
            if (!entryId) {
                return;
            }

            modalForm.setAttribute('action', `/finance/update/${entryId}?_method=PUT`);

            if (modalTitle) {
                const description = trigger.getAttribute('data-entry-description') || '';
                modalTitle.textContent = description
                    ? `Editar lançamento #${entryId} • ${description}`
                    : `Editar lançamento #${entryId}`;
            }

            setFieldValue('description', trigger.getAttribute('data-entry-description') || '');
            setFieldValue('type', trigger.getAttribute('data-entry-type') || 'payable');
            setFieldValue('financeCategoryId', trigger.getAttribute('data-entry-category-id'));
            setFieldValue('value', trigger.getAttribute('data-entry-value') || '');
            setFieldValue('dueDate', trigger.getAttribute('data-entry-due-date') || '');
            setFieldValue('paymentDate', trigger.getAttribute('data-entry-payment-date') || '');
            setFieldValue('status', trigger.getAttribute('data-entry-status') || 'pending');
            const recurringValue = trigger.getAttribute('data-entry-recurring') === 'true' ? 'true' : 'false';
            setFieldValue('recurring', recurringValue);
            setFieldValue('recurringInterval', trigger.getAttribute('data-entry-recurring-interval') || '');

            const attachments = decodeAttachmentData(trigger.getAttribute('data-entry-attachments'));
            hydrateAttachmentsList(attachmentsContainer, attachments);

            const attachmentsInput = modalForm.querySelector('#modal-entry-attachments');
            if (attachmentsInput) {
                attachmentsInput.value = '';
            }
        };

        triggers.forEach((trigger) => {
            trigger.addEventListener('click', () => hydrateModal(trigger));
        });
    };

    document.addEventListener('DOMContentLoaded', () => {
        const state = parseStateElement();
        const filterForms = document.querySelectorAll('[data-filter-form]');
        const exportLinks = document.querySelectorAll('[data-export-target]');
        const chartCanvas = document.getElementById('financePerformanceChart');

        filterForms.forEach((form) => {
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                submitFormWithFilters(form);
            });

            const clearButton = form.querySelector('[data-filter-clear]');
            if (clearButton) {
                clearButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    form.reset();
                    submitFormWithFilters(form);
                });
            }

            const fields = form.querySelectorAll('input[name], select[name], textarea[name]');
            fields.forEach((field) => {
                if (!field) {
                    return;
                }
                const updateExports = () => refreshExportLinks(exportLinks);
                field.addEventListener('input', updateExports);
                field.addEventListener('change', () => {
                    updateExports();
                    if (field.dataset.autoSubmit === 'true') {
                        submitFormWithFilters(form);
                    }
                });
            });
        });

        refreshExportLinks(exportLinks);

        if (chartCanvas && Array.isArray(state.monthlySummary) && state.monthlySummary.length) {
            if (typeof window.Chart !== 'undefined') {
                renderFinanceChart(chartCanvas, state.monthlySummary);
            } else {
                window.addEventListener('load', () => renderFinanceChart(chartCanvas, state.monthlySummary), { once: true });
            }
        }

        setupImportToggle();
        registerEntryModal();
    });
})();
