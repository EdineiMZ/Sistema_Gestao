(function () {
    const STATE_ELEMENT_ID = 'financeBudgetState';
    const FEEDBACK_SELECTOR = '[data-budget-feedback]';
    const GRID_SELECTOR = '[data-budget-grid]';
    const CATEGORY_LIST_SELECTOR = '[data-category-consumption-list]';
    const MONTH_SELECTOR = '[data-budget-month-selector]';
    const SUMMARY_CONSUMPTION_SELECTOR = '[data-budget-summary="consumption"]';
    const SUMMARY_LIMIT_SELECTOR = '[data-budget-summary="limit"]';
    const SUMMARY_USAGE_SELECTOR = '[data-budget-summary="usage"]';
    const BUDGET_CARD_SELECTOR = '[data-budget-card]';
    const CHART_CANVAS_ID = 'budget-consumption-chart';

    const parseStateElement = () => {
        const element = document.getElementById(STATE_ELEMENT_ID);
        if (!element) {
            return {};
        }

        try {
            const raw = element.textContent || element.innerText || '{}';
            return JSON.parse(raw);
        } catch (error) {
            console.warn('Não foi possível analisar o estado inicial de orçamentos.', error);
            return {};
        }
    };

    const clamp = (value, { min = 0, max = 1 } = {}) => {
        if (!Number.isFinite(value)) {
            return min;
        }
        if (value < min) {
            return min;
        }
        if (value > max) {
            return max;
        }
        return value;
    };

    const sanitizeColor = (value, fallback = '#6b7280') => {
        if (typeof value !== 'string') {
            return fallback;
        }
        const trimmed = value.trim();
        if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) {
            return trimmed;
        }
        return fallback;
    };

    const sanitizeIcon = (value, fallback = 'bi-activity') => {
        if (typeof value !== 'string') {
            return fallback;
        }
        const normalized = value.trim();
        return /^bi-[a-z0-9-]+$/i.test(normalized) ? normalized : fallback;
    };

    const buildClassList = (value, fallback = '') => {
        if (typeof value !== 'string') {
            return fallback ? fallback.split(/\s+/).filter(Boolean) : [];
        }
        return value
            .split(/\s+/)
            .map((item) => item.trim())
            .filter(Boolean);
    };

    const percentDisplayFormatter = new Intl.NumberFormat('pt-BR', {
        style: 'percent',
        minimumFractionDigits: 0,
        maximumFractionDigits: 1
    });

    const currencyFormatter = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2
    });

    const formatCurrency = (value) => currencyFormatter.format(Number(value) || 0);

    const formatPercentDisplay = (decimalValue) => {
        const normalized = clamp(Number(decimalValue) || 0, { min: 0, max: 10 });
        return percentDisplayFormatter.format(normalized);
    };

    const formatMonthLabel = (value) => {
        if (!value) {
            return '';
        }
        const safeValue = String(value);
        const isoDate = `${safeValue}-01T00:00:00`;
        const parsedDate = new Date(isoDate);

        if (Number.isFinite(parsedDate.getTime())) {
            return parsedDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        }

        const parts = safeValue.split('-');
        if (parts.length === 2) {
            return `${parts[1]}/${parts[0]}`;
        }

        return safeValue;
    };

    const resolveStatusStyle = (item, statusMeta = {}) => {
        if (item && typeof item.statusStyle === 'object' && item.statusStyle) {
            return {
                badgeClass: buildClassList(item.statusStyle.badgeClass).join(' ') || 'bg-success-subtle text-success',
                icon: sanitizeIcon(item.statusStyle.icon),
                label: item.statusStyle.label || 'Consumo saudável',
                barColor: sanitizeColor(item.statusStyle.barColor)
            };
        }

        const statusKey = item?.status || item?.statusMeta?.key || 'healthy';
        const source = statusMeta && statusMeta[statusKey] ? statusMeta[statusKey] : statusMeta.healthy;
        return {
            badgeClass: buildClassList(source?.badgeClass, 'bg-success-subtle text-success').join(' '),
            icon: sanitizeIcon(source?.icon, 'bi-emoji-smile'),
            label: source?.label || 'Consumo saudável',
            barColor: sanitizeColor(source?.barColor, '#10b981')
        };
    };

    const parsePercentInput = (rawValue) => {
        if (typeof rawValue !== 'string') {
            return null;
        }
        const sanitized = rawValue.replace(/[^0-9.,]/g, '').replace(/,/g, '.');
        if (!sanitized) {
            return null;
        }
        const parsed = Number.parseFloat(sanitized);
        if (!Number.isFinite(parsed)) {
            return null;
        }
        return clamp(parsed / 100, { min: 0, max: 10 });
    };

    const hydratePercentInput = (input) => {
        if (!(input instanceof HTMLInputElement)) {
            return;
        }
        let decimalValue = parsePercentInput(input.value);
        if (!Number.isFinite(decimalValue)) {
            decimalValue = Number.parseFloat(input.dataset.percentValue);
        }
        if (!Number.isFinite(decimalValue)) {
            decimalValue = 0;
        }

        const updateDisplay = () => {
            input.value = formatPercentDisplay(decimalValue);
            input.dataset.percentValue = decimalValue.toString();
        };

        const handleFocus = () => {
            const numeric = decimalValue * 100;
            input.value = numeric.toLocaleString('pt-BR', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 1
            });
            input.select?.();
        };

        const handleInput = (event) => {
            const target = event.target;
            const nextValue = parsePercentInput(target.value);
            if (nextValue === null) {
                if (target.value === '') {
                    decimalValue = 0;
                }
                return;
            }
            decimalValue = nextValue;
            input.dataset.percentValue = decimalValue.toString();
        };

        const handleBlur = () => {
            updateDisplay();
        };

        input.addEventListener('focus', handleFocus);
        input.addEventListener('input', handleInput);
        input.addEventListener('blur', handleBlur);

        updateDisplay();
    };

    const applyPercentMasks = (root) => {
        const scope = root || document;
        const inputs = scope.querySelectorAll('[data-percent-mask]');
        inputs.forEach((input) => hydratePercentInput(input));
    };

    const showFeedback = (container, type, message) => {
        if (!container) {
            return;
        }
        const classes = ['alert', 'd-flex', 'align-items-center', 'gap-2', 'mt-3'];
        const variants = {
            success: 'alert-success',
            error: 'alert-danger',
            warning: 'alert-warning',
            info: 'alert-info'
        };
        Object.keys(variants).forEach((variant) => container.classList.remove(variants[variant]));
        container.classList.remove('d-none');
        container.classList.add(...classes, variants[type] || variants.info);
        container.setAttribute('role', 'alert');
        container.textContent = message;
    };

    const clearFeedback = (container) => {
        if (!container) {
            return;
        }
        container.classList.add('d-none');
        container.textContent = '';
    };

    const buildRequestPayload = (form) => {
        const method = (form.getAttribute('method') || 'POST').toUpperCase();
        const action = form.getAttribute('action') || form.dataset.endpoint || form.dataset.url;
        if (!action) {
            throw new Error('Formulário de orçamento sem destino definido.');
        }

        const formData = new FormData(form);
        const percentInputs = form.querySelectorAll('[data-percent-mask]');
        percentInputs.forEach((input) => {
            if (!(input instanceof HTMLInputElement) || !input.name) {
                return;
            }
            const stored = input.dataset.percentValue;
            if (stored !== undefined) {
                formData.set(input.name, stored);
            }
        });

        if (method === 'GET') {
            const params = new URLSearchParams(formData);
            const separator = action.includes('?') ? '&' : '?';
            return {
                url: params.toString() ? `${action}${separator}${params.toString()}` : action,
                options: {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json'
                    },
                    credentials: 'same-origin'
                }
            };
        }

        const enctype = (form.getAttribute('enctype') || '').toLowerCase();
        const sendMultipart = enctype === 'multipart/form-data';
        let body;
        const headers = {
            Accept: 'application/json'
        };

        if (sendMultipart) {
            body = formData;
        } else {
            const jsonPayload = {};
            formData.forEach((value, key) => {
                if (Object.prototype.hasOwnProperty.call(jsonPayload, key)) {
                    const existing = jsonPayload[key];
                    jsonPayload[key] = Array.isArray(existing) ? existing.concat(value) : [existing, value];
                } else {
                    jsonPayload[key] = value;
                }
            });
            body = JSON.stringify(jsonPayload);
            headers['Content-Type'] = 'application/json';
        }

        return {
            url: action,
            options: {
                method,
                body,
                headers,
                credentials: 'same-origin'
            }
        };
    };

    const parseResponseBody = async (response) => {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            try {
                return await response.json();
            } catch (error) {
                console.warn('Resposta JSON inválida recebida da API de orçamentos.', error);
                return null;
            }
        }
        try {
            return await response.text();
        } catch (error) {
            return null;
        }
    };

    const triggerAnalytics = (eventName, detail = {}) => {
        if (typeof window === 'undefined') {
            return;
        }
        try {
            if (window.dataLayer && typeof window.dataLayer.push === 'function') {
                window.dataLayer.push({
                    event: eventName,
                    ...detail
                });
            } else if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(
                    new CustomEvent(eventName, {
                        detail,
                        bubbles: true
                    })
                );
            }
        } catch (error) {
            console.warn('Não foi possível registrar evento analítico para orçamentos.', error);
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        const state = parseStateElement();
        const budgetGrid = document.querySelector(GRID_SELECTOR);
        const monthSelector = document.querySelector(MONTH_SELECTOR);
        const summaryConsumption = document.querySelector(SUMMARY_CONSUMPTION_SELECTOR);
        const summaryLimit = document.querySelector(SUMMARY_LIMIT_SELECTOR);
        const summaryUsage = document.querySelector(SUMMARY_USAGE_SELECTOR);
        const categoryList = document.querySelector(CATEGORY_LIST_SELECTOR);
        const feedbackElement = document.querySelector(FEEDBACK_SELECTOR);
        const chartCanvas = document.getElementById(CHART_CANVAS_ID);

        let budgets = Array.isArray(state.budgets) ? state.budgets : [];
        let categoryConsumption = Array.isArray(state.categoryConsumption)
            ? state.categoryConsumption
            : [];
        let months = Array.isArray(state.budgetMonths) ? state.budgetMonths : [];
        let activeMonth = state.activeBudgetMonth || (months.length ? months[months.length - 1] : 'all');
        let statusMeta = state.budgetStatusMeta && typeof state.budgetStatusMeta === 'object' ? state.budgetStatusMeta : {};
        let chartInstance = null;
        let gridHydrated = false;

        const getFilteredBudgets = (monthKey) => {
            if (!monthKey || monthKey === 'all') {
                return budgets;
            }
            return budgets.filter((item) => item && item.month === monthKey);
        };

        const toggleBudgetCards = (monthKey) => {
            if (!budgetGrid) {
                return;
            }
            const normalized = monthKey && monthKey !== 'all' ? monthKey : null;
            const cards = budgetGrid.querySelectorAll(BUDGET_CARD_SELECTOR);
            cards.forEach((card) => {
                const cardMonth = card.getAttribute('data-budget-month');
                const shouldShow = !normalized || cardMonth === normalized;
                card.classList.toggle('d-none', !shouldShow);
            });
        };

        const rebuildBudgetGrid = (dataset) => {
            if (!budgetGrid) {
                return;
            }
            const fragment = document.createDocumentFragment();
            dataset.forEach((item) => {
                if (!item) {
                    return;
                }
                const statusStyle = resolveStatusStyle(item, statusMeta);
                const column = document.createElement('div');
                column.className = 'col-12 col-md-6';
                column.setAttribute('data-budget-card', '');
                column.setAttribute('data-budget-month', item.month || '');

                const card = document.createElement('div');
                card.className = 'h-100 border rounded-4 p-4 shadow-sm position-relative';

                const header = document.createElement('div');
                header.className = 'd-flex justify-content-between align-items-start gap-3 mb-3';

                const headerLeft = document.createElement('div');
                headerLeft.className = 'd-flex align-items-start gap-3';

                const colorDot = document.createElement('span');
                colorDot.className = 'rounded-circle flex-shrink-0';
                colorDot.setAttribute('aria-hidden', 'true');
                colorDot.style.width = '12px';
                colorDot.style.height = '12px';
                colorDot.style.background = sanitizeColor(item.categoryColor);

                const headerInfo = document.createElement('div');
                const title = document.createElement('h4');
                title.className = 'h6 fw-semibold mb-1 text-truncate';
                title.textContent = item.categoryName || 'Sem categoria';
                const monthBadge = document.createElement('span');
                monthBadge.className = 'badge bg-light text-muted fw-normal text-uppercase small px-2 py-1';
                monthBadge.textContent = formatMonthLabel(item.month);

                headerInfo.appendChild(title);
                headerInfo.appendChild(monthBadge);

                headerLeft.appendChild(colorDot);
                headerLeft.appendChild(headerInfo);

                const statusBadge = document.createElement('span');
                const badgeClasses = buildClassList(statusStyle.badgeClass, 'bg-success-subtle text-success');
                statusBadge.classList.add('badge', ...badgeClasses, 'd-inline-flex', 'align-items-center', 'gap-1');
                const statusIcon = document.createElement('i');
                statusIcon.classList.add('bi', sanitizeIcon(statusStyle.icon));
                statusIcon.setAttribute('aria-hidden', 'true');
                const statusLabel = document.createElement('span');
                statusLabel.textContent = statusStyle.label;
                statusBadge.appendChild(statusIcon);
                statusBadge.appendChild(statusLabel);

                header.appendChild(headerLeft);
                header.appendChild(statusBadge);

                const progressWrapper = document.createElement('div');
                progressWrapper.className = 'mb-4';
                const progressBar = document.createElement('div');
                progressBar.className = 'progress bg-light rounded-pill';
                progressBar.style.height = '8px';
                const progressValue = document.createElement('div');
                progressValue.className = 'progress-bar';
                progressValue.setAttribute('role', 'progressbar');
                const usageValue = Number(item.usage) || 0;
                progressValue.style.width = `${Math.min(usageValue, 130).toFixed(1)}%`;
                progressValue.style.background = statusStyle.barColor;
                progressValue.setAttribute('aria-valuenow', usageValue.toFixed(1));
                progressValue.setAttribute('aria-valuemin', '0');
                progressValue.setAttribute('aria-valuemax', '150');
                progressBar.appendChild(progressValue);
                const progressMeta = document.createElement('div');
                progressMeta.className = 'd-flex justify-content-between text-muted small mt-2';
                const progressMetaLabel = document.createElement('span');
                progressMetaLabel.textContent = 'Consumido';
                const progressMetaValue = document.createElement('span');
                progressMetaValue.textContent = formatCurrency(item.consumption);
                progressMeta.appendChild(progressMetaLabel);
                progressMeta.appendChild(progressMetaValue);
                progressWrapper.appendChild(progressBar);
                progressWrapper.appendChild(progressMeta);

                const footer = document.createElement('div');
                footer.className = 'd-flex flex-wrap gap-3 text-sm';

                const limitWrapper = document.createElement('div');
                const limitLabel = document.createElement('span');
                limitLabel.className = 'text-muted small d-block';
                limitLabel.textContent = 'Limite';
                const limitValue = document.createElement('span');
                limitValue.className = 'fw-semibold';
                limitValue.textContent = formatCurrency(item.monthlyLimit);
                limitWrapper.appendChild(limitLabel);
                limitWrapper.appendChild(limitValue);

                const remainingWrapper = document.createElement('div');
                const remainingLabel = document.createElement('span');
                remainingLabel.className = 'text-muted small d-block';
                remainingLabel.textContent = 'Disponível';
                const remainingValue = document.createElement('span');
                remainingValue.className = 'fw-semibold';
                remainingValue.classList.add((Number(item.remaining) || 0) < 0 ? 'text-danger' : 'text-success');
                remainingValue.textContent = formatCurrency(item.remaining);
                remainingWrapper.appendChild(remainingLabel);
                remainingWrapper.appendChild(remainingValue);

                const usageWrapper = document.createElement('div');
                const usageLabel = document.createElement('span');
                usageLabel.className = 'text-muted small d-block';
                usageLabel.textContent = 'Utilização';
                const usageValueLabel = document.createElement('span');
                usageValueLabel.className = 'fw-semibold';
                usageValueLabel.textContent = `${usageValue.toFixed(1)}%`;
                usageWrapper.appendChild(usageLabel);
                usageWrapper.appendChild(usageValueLabel);

                footer.appendChild(limitWrapper);
                footer.appendChild(remainingWrapper);
                footer.appendChild(usageWrapper);

                card.appendChild(header);
                card.appendChild(progressWrapper);
                card.appendChild(footer);
                column.appendChild(card);
                fragment.appendChild(column);
            });

            budgetGrid.replaceChildren(fragment);
            gridHydrated = true;
        };

        const renderSummary = (monthKey) => {
            const dataset = getFilteredBudgets(monthKey);
            const totalConsumption = dataset.reduce((acc, item) => acc + (Number(item?.consumption) || 0), 0);
            const totalLimit = dataset.reduce((acc, item) => acc + (Number(item?.monthlyLimit) || 0), 0);
            const usage = totalLimit > 0 ? (totalConsumption / totalLimit) : 0;

            if (summaryConsumption) {
                summaryConsumption.textContent = formatCurrency(totalConsumption);
            }
            if (summaryLimit) {
                summaryLimit.textContent = formatCurrency(totalLimit);
            }
            if (summaryUsage) {
                summaryUsage.textContent = `${(usage * 100).toFixed(1)}%`;
            }
        };

        const renderChart = (monthKey) => {
            if (!chartCanvas || typeof window.Chart === 'undefined') {
                return;
            }
            const dataset = getFilteredBudgets(monthKey);
            const aggregated = dataset.reduce((acc, item) => {
                const key = item?.categoryId || item?.categoryName || Math.random().toString(36).slice(2);
                if (!acc[key]) {
                    acc[key] = {
                        label: item?.categoryName || 'Sem categoria',
                        color: sanitizeColor(item?.categoryColor, '#2563eb'),
                        value: 0
                    };
                }
                acc[key].value += Number(item?.consumption) || 0;
                return acc;
            }, {});

            const labels = Object.values(aggregated).map((item) => item.label);
            const values = Object.values(aggregated).map((item) => item.value);
            const colors = Object.values(aggregated).map((item) => item.color);

            if (chartInstance) {
                chartInstance.destroy();
                chartInstance = null;
            }

            if (!labels.length) {
                return;
            }

            const context = chartCanvas.getContext('2d');
            if (!context) {
                return;
            }

            chartInstance = new window.Chart(context, {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [
                        {
                            data: values,
                            backgroundColor: colors,
                            borderWidth: 0
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const label = context.label || '';
                                    const value = Number.isFinite(context.parsed) ? context.parsed : 0;
                                    return `${label}: ${formatCurrency(value)}`;
                                }
                            }
                        }
                    }
                }
            });
        };

        const renderCategoryList = (monthKey) => {
            if (!categoryList) {
                return;
            }
            const dataset = getFilteredBudgets(monthKey);
            if (!dataset.length) {
                categoryList.replaceChildren();
                const emptyMessage = document.createElement('div');
                emptyMessage.className = 'text-muted';
                emptyMessage.textContent = 'Nenhum consumo registrado para o período selecionado.';
                categoryList.appendChild(emptyMessage);
                return;
            }

            const aggregates = dataset.reduce((acc, item) => {
                const key = item?.categoryId || item?.categoryName || Math.random().toString(36).slice(2);
                if (!acc[key]) {
                    acc[key] = {
                        name: item?.categoryName || 'Sem categoria',
                        color: sanitizeColor(item?.categoryColor),
                        consumption: 0,
                        usage: 0,
                        months: new Set()
                    };
                }
                acc[key].consumption += Number(item?.consumption) || 0;
                acc[key].usage = Math.max(acc[key].usage, Number(item?.usage) || 0);
                if (item?.month) {
                    acc[key].months.add(item.month);
                }
                return acc;
            }, {});

            const sorted = Object.values(aggregates)
                .map((item) => ({
                    ...item,
                    months: item.months.size
                }))
                .sort((a, b) => b.consumption - a.consumption)
                .slice(0, 6);

            categoryList.replaceChildren();

            sorted.forEach((item) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'list-group-item px-0 d-flex justify-content-between align-items-center gap-3';

                const left = document.createElement('div');
                left.className = 'd-flex align-items-center gap-3';

                const colorDot = document.createElement('span');
                colorDot.className = 'rounded-circle flex-shrink-0';
                colorDot.style.width = '10px';
                colorDot.style.height = '10px';
                colorDot.style.background = item.color;
                colorDot.setAttribute('aria-hidden', 'true');

                const textWrapper = document.createElement('div');
                const title = document.createElement('div');
                title.className = 'fw-semibold text-truncate';
                title.textContent = item.name;
                const meta = document.createElement('div');
                meta.className = 'text-muted small';
                meta.textContent = `Média: ${item.usage.toFixed(1)}% · Meses: ${item.months}`;
                textWrapper.appendChild(title);
                textWrapper.appendChild(meta);

                left.appendChild(colorDot);
                left.appendChild(textWrapper);

                const right = document.createElement('div');
                right.className = 'text-end';
                const consumptionLabel = document.createElement('div');
                consumptionLabel.className = 'fw-semibold';
                consumptionLabel.textContent = formatCurrency(item.consumption);
                right.appendChild(consumptionLabel);

                wrapper.appendChild(left);
                wrapper.appendChild(right);
                categoryList.appendChild(wrapper);
            });
        };

        const updateWidgets = (monthKey) => {
            toggleBudgetCards(monthKey);
            renderSummary(monthKey);
            renderChart(monthKey);
            renderCategoryList(monthKey);
        };

        const refreshMonthSelector = (availableMonths) => {
            if (!monthSelector) {
                return;
            }
            const existingValue = monthSelector.value || 'all';
            monthSelector.replaceChildren();
            const allOption = document.createElement('option');
            allOption.value = 'all';
            allOption.textContent = 'Todos os meses';
            monthSelector.appendChild(allOption);
            availableMonths.forEach((month) => {
                const option = document.createElement('option');
                option.value = month;
                option.textContent = formatMonthLabel(month);
                monthSelector.appendChild(option);
            });
            if (availableMonths.includes(existingValue)) {
                monthSelector.value = existingValue;
            } else if (availableMonths.includes(activeMonth)) {
                monthSelector.value = activeMonth;
            } else {
                monthSelector.value = 'all';
            }
        };

        const syncState = (payload = {}) => {
            if (Array.isArray(payload.budgets)) {
                budgets = payload.budgets;
                gridHydrated = false;
            } else if (Array.isArray(payload.summaries)) {
                budgets = payload.summaries;
                gridHydrated = false;
            }
            if (Array.isArray(payload.categoryConsumption)) {
                categoryConsumption = payload.categoryConsumption;
            }
            if (Array.isArray(payload.months)) {
                months = payload.months;
                refreshMonthSelector(months);
            }
            if (payload.activeMonth) {
                activeMonth = payload.activeMonth;
                if (monthSelector) {
                    monthSelector.value = payload.activeMonth;
                }
            }
            if (payload.budgetStatusMeta && typeof payload.budgetStatusMeta === 'object') {
                statusMeta = { ...statusMeta, ...payload.budgetStatusMeta };
            }

            if (!gridHydrated && budgetGrid) {
                rebuildBudgetGrid(budgets);
            }
            updateWidgets(monthSelector?.value || activeMonth || 'all');
        };

        if (monthSelector && !months.length) {
            const options = Array.from(monthSelector.querySelectorAll('option'))
                .map((option) => option.value)
                .filter((value) => value && value !== 'all');
            months = options;
        }

        if (monthSelector) {
            monthSelector.addEventListener('change', (event) => {
                const value = event.target.value || 'all';
                updateWidgets(value);
            });
        }

        updateWidgets(monthSelector?.value || activeMonth || 'all');

        applyPercentMasks(document);

        const forms = document.querySelectorAll('[data-budget-form]');
        forms.forEach((form) => {
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                if (form.dataset.submitting === 'true') {
                    return;
                }
                form.dataset.submitting = 'true';
                clearFeedback(feedbackElement);

                const submitButton = form.querySelector('[type="submit"]');
                const originalButtonText = submitButton ? submitButton.innerHTML : null;
                if (submitButton) {
                    submitButton.disabled = true;
                    submitButton.innerHTML = `
                        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Processando...
                    `;
                }

                try {
                    const { url, options } = buildRequestPayload(form);
                    const response = await fetch(url, options);
                    const payload = await parseResponseBody(response);

                    if (!response.ok) {
                        const message = payload?.message || 'Não foi possível salvar o orçamento.';
                        showFeedback(feedbackElement, 'error', message);
                        throw new Error(message);
                    }

                    const message = payload?.message || 'Orçamento atualizado com sucesso!';
                    showFeedback(feedbackElement, 'success', message);
                    triggerAnalytics('finance_budget_submit', {
                        status: 'success',
                        method: options.method,
                        endpoint: url
                    });

                    if (payload && typeof payload === 'object') {
                        syncState(payload);
                    }
                } catch (error) {
                    console.error('Erro ao processar formulário de orçamento.', error);
                    triggerAnalytics('finance_budget_submit', {
                        status: 'error',
                        message: error?.message || 'unknown'
                    });
                } finally {
                    form.dataset.submitting = 'false';
                    if (submitButton) {
                        submitButton.disabled = false;
                        submitButton.innerHTML = originalButtonText;
                    }
                }
            });
        });

        const actionButtons = document.querySelectorAll('[data-budget-action]');
        actionButtons.forEach((button) => {
            button.addEventListener('click', async (event) => {
                const target = event.currentTarget;
                const endpoint = target.getAttribute('data-budget-endpoint');
                const method = (target.getAttribute('data-budget-method') || 'DELETE').toUpperCase();
                if (!endpoint) {
                    return;
                }

                clearFeedback(feedbackElement);
                target.disabled = true;
                const originalContent = target.innerHTML;
                target.innerHTML = `
                    <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Atualizando...
                `;

                try {
                    const response = await fetch(endpoint, {
                        method,
                        headers: {
                            Accept: 'application/json'
                        },
                        credentials: 'same-origin'
                    });
                    const payload = await parseResponseBody(response);
                    if (!response.ok) {
                        const message = payload?.message || 'Falha ao atualizar orçamento.';
                        showFeedback(feedbackElement, 'error', message);
                        throw new Error(message);
                    }

                    const message = payload?.message || 'Orçamento atualizado com sucesso!';
                    showFeedback(feedbackElement, 'success', message);
                    triggerAnalytics('finance_budget_action', {
                        status: 'success',
                        method,
                        endpoint
                    });

                    if (payload && typeof payload === 'object') {
                        syncState(payload);
                    }
                } catch (error) {
                    console.error('Erro ao executar ação rápida de orçamento.', error);
                    triggerAnalytics('finance_budget_action', {
                        status: 'error',
                        method,
                        endpoint
                    });
                } finally {
                    target.disabled = false;
                    target.innerHTML = originalContent;
                }
            });
        });
    });
})();
