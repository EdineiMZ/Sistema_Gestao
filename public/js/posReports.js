(function () {
    const root = document.getElementById('posReportsRoot');
    if (!root) {
        return;
    }

    const rangeSelect = document.querySelector('[data-range-select]');
    const refreshButton = document.querySelector('[data-refresh]');
    const alertBox = document.querySelector('[data-reports-alert]');
    const lastUpdated = document.querySelector('[data-last-updated]');
    const loadingBackdrop = root.querySelector('[data-loading-backdrop]');

    const overviewFields = {
        net: root.querySelector('[data-overview-metric="net"]'),
        orders: root.querySelector('[data-overview-metric="orders"]'),
        averageTicket: root.querySelector('[data-overview-metric="averageTicket"]'),
        gross: root.querySelector('[data-overview-metric="gross"]'),
        taxes: root.querySelector('[data-overview-metric="taxes"]'),
        discounts: root.querySelector('[data-overview-metric="discounts"]')
    };

    const overviewVariations = {
        revenue: root.querySelector('[data-overview-variation="revenue"]'),
        orders: root.querySelector('[data-overview-variation="orders"]'),
        averageTicket: root.querySelector('[data-overview-variation="averageTicket"]')
    };

    const overviewBestDay = root.querySelector('[data-overview-best-day]');
    const paymentList = root.querySelector('[data-payment-list]');
    const topSummaryFields = {
        quantity: root.querySelector('[data-top-total-quantity]'),
        revenue: root.querySelector('[data-top-total-revenue]')
    };
    const topProductsBody = root.querySelector('[data-top-products-body]');
    const hourlyHighlight = root.querySelector('[data-hourly-highlight]');
    const hourlyInsights = root.querySelector('[data-hourly-insights]');
    const dailyHighlight = root.querySelector('[data-daily-highlight]');
    const dailyInsights = root.querySelector('[data-daily-insights]');
    const stockSummaryFields = {
        totalActive: root.querySelector('[data-stock-metric="totalActive"]'),
        lowStock: root.querySelector('[data-stock-metric="lowStock"]'),
        outOfStock: root.querySelector('[data-stock-metric="outOfStock"]'),
        adequateStock: root.querySelector('[data-stock-metric="adequateStock"]')
    };
    const stockBody = root.querySelector('[data-stock-body]');

    const overviewTrendCanvas = document.getElementById('overviewTrendChart');
    const paymentBreakdownCanvas = document.getElementById('paymentBreakdownChart');
    const topProductsCanvas = document.getElementById('topProductsChart');
    const hourlyMovementCanvas = document.getElementById('hourlyMovementChart');
    const dailyMovementCanvas = document.getElementById('dailyMovementChart');

    const numberFormatter = new Intl.NumberFormat('pt-BR');
    const currencyFormatter = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2
    });

    const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: 'short'
    });

    const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
    });

    const paymentMethods = (() => {
        try {
            return JSON.parse(root.dataset.paymentMethods || '[]');
        } catch (error) {
            return [];
        }
    })();

    const paymentLabelMap = new Map(
        Array.isArray(paymentMethods) ? paymentMethods.map((method) => [method.value, method.label]) : []
    );

    const colors = {
        primary: '#0d6efd',
        primarySoft: 'rgba(13, 110, 253, 0.15)',
        secondary: '#6f42c1',
        success: '#20c997',
        info: '#0dcaf0',
        warning: '#ffc107',
        danger: '#dc3545',
        muted: '#adb5bd'
    };

    const charts = {
        overviewTrend: null,
        paymentBreakdown: null,
        topProducts: null,
        hourlyMovement: null,
        dailyMovement: null
    };

    const state = {
        range: root.dataset.defaultRange || '30d',
        isFetching: false,
        autoRefreshId: null
    };

    const endpoints = Object.freeze({
        overview: '/pos/reports/overview',
        topProducts: '/pos/reports/top-products',
        hourly: '/pos/reports/movements/hourly',
        daily: '/pos/reports/movements/daily',
        stock: '/pos/reports/stock'
    });

    const setLoading = (isLoading) => {
        if (loadingBackdrop) {
            loadingBackdrop.classList.toggle('d-none', !isLoading);
        }

        if (refreshButton) {
            refreshButton.disabled = isLoading;
        }

        if (rangeSelect) {
            rangeSelect.disabled = isLoading;
        }
    };

    const clearAlert = () => {
        if (!alertBox) {
            return;
        }
        alertBox.classList.add('d-none');
        alertBox.textContent = '';
    };

    const showAlert = (message) => {
        if (!alertBox) {
            return;
        }
        alertBox.textContent = message;
        alertBox.classList.remove('d-none');
    };

    const formatCurrency = (value) => currencyFormatter.format(Number(value) || 0);
    const formatNumber = (value) => numberFormatter.format(Number(value) || 0);

    const formatVariationBadge = (value) => {
        if (value === null || value === undefined || Number.isNaN(Number(value))) {
            return { text: 'Sem variação', classes: 'bg-secondary-subtle text-secondary' };
        }

        const numeric = Number(value);
        const arrow = numeric > 0 ? '▲' : numeric < 0 ? '▼' : '▬';
        const classes =
            numeric > 0
                ? 'bg-success-subtle text-success'
                : numeric < 0
                    ? 'bg-danger-subtle text-danger'
                    : 'bg-secondary-subtle text-secondary';
        const text = `${arrow} ${numeric > 0 ? '+' : ''}${numeric.toFixed(1)}%`;
        return { text, classes };
    };

    const formatDateLabel = (isoString) => {
        if (!isoString) {
            return '--';
        }
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) {
            return '--';
        }
        return dateFormatter.format(date).replace('.', '');
    };

    const updateTimestamp = (isoString) => {
        if (!lastUpdated) {
            return;
        }
        const date = isoString ? new Date(isoString) : new Date();
        if (Number.isNaN(date.getTime())) {
            lastUpdated.textContent = '--';
            return;
        }
        lastUpdated.textContent = dateTimeFormatter.format(date);
    };

    const destroyChart = (key) => {
        const chart = charts[key];
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
        }
        charts[key] = null;
    };

    const renderPaymentList = (payments = []) => {
        if (!paymentList) {
            return;
        }
        paymentList.textContent = '';

        if (!payments.length) {
            const emptyItem = document.createElement('li');
            emptyItem.className = 'text-muted';
            emptyItem.textContent = 'Nenhum pagamento registrado no período.';
            paymentList.appendChild(emptyItem);
            return;
        }

        payments.forEach((payment) => {
            const item = document.createElement('li');
            item.className = 'd-flex justify-content-between align-items-center mb-1';

            const label = document.createElement('span');
            label.textContent = payment.label || payment.method || 'Indefinido';

            const valueWrapper = document.createElement('span');
            valueWrapper.className = 'text-muted';
            const amount = document.createElement('strong');
            amount.className = 'ms-2 text-body';
            amount.textContent = formatCurrency(payment.amount);
            valueWrapper.textContent = `${payment.share ? payment.share.toFixed(1) : '0.0'}% `;
            valueWrapper.appendChild(amount);

            item.appendChild(label);
            item.appendChild(valueWrapper);
            paymentList.appendChild(item);
        });
    };

    const renderTopProductsTable = (items = []) => {
        if (!topProductsBody) {
            return;
        }
        topProductsBody.textContent = '';

        if (!items.length) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 3;
            cell.className = 'text-center text-muted py-4';
            cell.textContent = 'Nenhum produto com vendas nesse período.';
            row.appendChild(cell);
            topProductsBody.appendChild(row);
            return;
        }

        items.forEach((item) => {
            const row = document.createElement('tr');

            const nameCell = document.createElement('td');
            const nameText = document.createElement('strong');
            nameText.textContent = item.name || 'Produto sem nome';
            const skuText = document.createElement('div');
            skuText.className = 'text-muted small';
            skuText.textContent = item.sku || 'SKU indefinido';
            nameCell.appendChild(nameText);
            nameCell.appendChild(skuText);

            const quantityCell = document.createElement('td');
            quantityCell.className = 'text-end fw-semibold';
            quantityCell.textContent = formatNumber(item.quantity);

            const revenueCell = document.createElement('td');
            revenueCell.className = 'text-end fw-semibold';
            revenueCell.textContent = formatCurrency(item.revenue);

            row.appendChild(nameCell);
            row.appendChild(quantityCell);
            row.appendChild(revenueCell);
            topProductsBody.appendChild(row);
        });
    };

    const renderStockTable = (items = []) => {
        if (!stockBody) {
            return;
        }

        stockBody.textContent = '';

        if (!items.length) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 4;
            cell.className = 'text-center text-muted py-4';
            cell.textContent = 'Nenhum produto ativo encontrado.';
            row.appendChild(cell);
            stockBody.appendChild(row);
            return;
        }

        items.forEach((item) => {
            const row = document.createElement('tr');
            if (item.isCritical) {
                row.classList.add('table-warning');
            }

            const nameCell = document.createElement('td');
            const nameText = document.createElement('strong');
            nameText.textContent = item.name || 'Produto';
            const skuText = document.createElement('div');
            skuText.className = 'text-muted small';
            skuText.textContent = item.sku || 'SKU não informado';
            nameCell.appendChild(nameText);
            nameCell.appendChild(skuText);

            const stockCell = document.createElement('td');
            stockCell.className = 'text-end fw-semibold';
            stockCell.textContent = formatNumber(item.stockQuantity);

            const thresholdCell = document.createElement('td');
            thresholdCell.className = 'text-end';
            thresholdCell.textContent =
                item.lowStockThreshold !== null && item.lowStockThreshold !== undefined
                    ? formatNumber(item.lowStockThreshold)
                    : '—';

            const backorderCell = document.createElement('td');
            backorderCell.className = 'text-center';
            const backorderBadge = document.createElement('span');
            backorderBadge.className = item.allowBackorder
                ? 'badge bg-success-subtle text-success'
                : 'badge bg-secondary-subtle text-secondary';
            backorderBadge.textContent = item.allowBackorder ? 'Permitido' : 'Não';
            backorderCell.appendChild(backorderBadge);

            row.appendChild(nameCell);
            row.appendChild(stockCell);
            row.appendChild(thresholdCell);
            row.appendChild(backorderCell);
            stockBody.appendChild(row);
        });
    };

    const renderHourlyInsights = (payload = {}) => {
        if (!hourlyInsights) {
            return;
        }

        hourlyInsights.textContent = '';
        const hours = Array.isArray(payload.hours) ? payload.hours : [];

        if (!hours.length) {
            const item = document.createElement('li');
            item.className = 'text-muted';
            item.textContent = 'Nenhuma venda registrada para calcular sugestões.';
            hourlyInsights.appendChild(item);
            return;
        }

        const busiest = payload.highlights && payload.highlights.busiestHour ? payload.highlights.busiestHour : null;
        if (busiest && busiest.orders > 0) {
            const item = document.createElement('li');
            item.textContent = `Maior fluxo às ${busiest.label} com ${formatNumber(
                busiest.orders
            )} pedidos (receita de ${formatCurrency(busiest.revenue)}).`;
            hourlyInsights.appendChild(item);
        }

        const calmHour = hours
            .filter((entry) => entry.orders === 0)
            .map((entry) => entry.label)
            .slice(0, 1)
            .shift();

        if (calmHour) {
            const item = document.createElement('li');
            item.textContent = `Considere ações promocionais antes das ${calmHour} para estimular vendas.`;
            hourlyInsights.appendChild(item);
        }

        if (!hourlyInsights.childElementCount) {
            const item = document.createElement('li');
            item.className = 'text-muted';
            item.textContent = 'Fluxo equilibrado em todo o período analisado.';
            hourlyInsights.appendChild(item);
        }
    };

    const renderDailyInsights = (payload = {}) => {
        if (!dailyInsights) {
            return;
        }

        dailyInsights.textContent = '';
        const days = Array.isArray(payload.days) ? payload.days : [];

        if (!days.length) {
            const item = document.createElement('li');
            item.className = 'text-muted';
            item.textContent = 'Nenhuma venda registrada para gerar insights.';
            dailyInsights.appendChild(item);
            return;
        }

        const totalOrders = days.reduce((acc, item) => acc + (Number(item.orders) || 0), 0);
        const averageOrders = days.length ? totalOrders / days.length : 0;

        const averageItem = document.createElement('li');
        averageItem.textContent = `Média de ${formatNumber(averageOrders.toFixed(1))} pedidos por dia no período.`;
        dailyInsights.appendChild(averageItem);

        const firstDay = days[0];
        const lastDay = days[days.length - 1];
        if (firstDay && lastDay) {
            const revenueDelta = Number(lastDay.revenue) - Number(firstDay.revenue);
            if (Math.abs(revenueDelta) >= 0.01) {
                const trendItem = document.createElement('li');
                trendItem.textContent = revenueDelta > 0
                    ? `Receita diária encerrou ${formatCurrency(revenueDelta)} acima do início do período.`
                    : `Receita diária encerrou ${formatCurrency(Math.abs(revenueDelta))} abaixo do início do período.`;
                dailyInsights.appendChild(trendItem);
            }
        }

        if (payload.highlights && payload.highlights.bestDay && payload.highlights.bestDay.revenue > 0) {
            const best = payload.highlights.bestDay;
            const item = document.createElement('li');
            item.textContent = `Maior receita em ${formatDateLabel(best.date)} (${formatCurrency(best.revenue)}).`;
            dailyInsights.appendChild(item);
        }
    };

    const updateOverview = (payload = {}) => {
        const totals = payload.totals || {};

        if (overviewFields.net) {
            overviewFields.net.textContent = formatCurrency(totals.net);
        }
        if (overviewFields.orders) {
            overviewFields.orders.textContent = formatNumber(totals.orders || 0);
        }
        if (overviewFields.averageTicket) {
            overviewFields.averageTicket.textContent = formatCurrency(totals.averageTicket || 0);
        }
        if (overviewFields.gross) {
            overviewFields.gross.textContent = formatCurrency(totals.gross);
        }
        if (overviewFields.taxes) {
            overviewFields.taxes.textContent = formatCurrency(totals.taxes);
        }
        if (overviewFields.discounts) {
            overviewFields.discounts.textContent = `-${formatCurrency(Math.abs(totals.discounts || 0))}`;
        }

        const variations = payload.variations || {};
        Object.entries(overviewVariations).forEach(([key, element]) => {
            if (!element) {
                return;
            }
            const variation = formatVariationBadge(variations[key]);
            element.textContent = variation.text;
            element.className = `summary-card__variation badge ${variation.classes}`;
        });

        if (overviewBestDay) {
            const best = payload.highlights && payload.highlights.bestDay ? payload.highlights.bestDay : null;
            if (best && best.revenue > 0) {
                overviewBestDay.textContent = `Melhor dia: ${formatDateLabel(best.date)} (${formatCurrency(best.revenue)})`;
            } else {
                overviewBestDay.textContent = 'Melhor dia: --';
            }
        }

        renderPaymentList(payload.payments || []);

        const trend = Array.isArray(payload.trend) ? payload.trend : [];
        if (overviewTrendCanvas) {
            if (!trend.length) {
                destroyChart('overviewTrend');
            } else {
                const labels = trend.map((item) => formatDateLabel(item.date));
                const revenueData = trend.map((item) => Number(item.revenue) || 0);
                const ordersData = trend.map((item) => Number(item.orders) || 0);

                destroyChart('overviewTrend');
                charts.overviewTrend = new window.Chart(overviewTrendCanvas, {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [
                            {
                                type: 'line',
                                label: 'Receita líquida',
                                data: revenueData,
                                borderColor: colors.primary,
                                backgroundColor: colors.primarySoft,
                                borderWidth: 2,
                                pointRadius: 3,
                                pointHoverRadius: 5,
                                tension: 0.35,
                                fill: true,
                                yAxisID: 'revenue'
                            },
                            {
                                type: 'bar',
                                label: 'Pedidos concluídos',
                                data: ordersData,
                                backgroundColor: colors.secondary,
                                borderRadius: 8,
                                maxBarThickness: 26,
                                yAxisID: 'orders'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { intersect: false, mode: 'index' },
                        scales: {
                            revenue: {
                                type: 'linear',
                                position: 'left',
                                grid: { drawOnChartArea: true, color: 'rgba(0,0,0,0.05)' },
                                ticks: {
                                    callback: (value) => currencyFormatter.format(value)
                                }
                            },
                            orders: {
                                type: 'linear',
                                position: 'right',
                                grid: { drawOnChartArea: false },
                                ticks: {
                                    callback: (value) => numberFormatter.format(value),
                                    precision: 0
                                }
                            }
                        },
                        plugins: {
                            legend: { display: true },
                            tooltip: {
                                callbacks: {
                                    label: (context) => {
                                        const rawValue = context.parsed.y;
                                        if (context.dataset.yAxisID === 'revenue') {
                                            return `${context.dataset.label}: ${formatCurrency(rawValue)}`;
                                        }
                                        return `${context.dataset.label}: ${formatNumber(rawValue)}`;
                                    }
                                }
                            }
                        }
                    }
                });
            }
        }

        if (paymentBreakdownCanvas) {
            const payments = Array.isArray(payload.payments) ? payload.payments : [];
            if (!payments.length) {
                destroyChart('paymentBreakdown');
            } else {
                const labels = payments.map((item) => item.label || item.method);
                const amounts = payments.map((item) => Number(item.amount) || 0);
                const palette = [
                    colors.primary,
                    colors.secondary,
                    colors.success,
                    colors.info,
                    colors.warning,
                    colors.danger,
                    '#6610f2'
                ];

                destroyChart('paymentBreakdown');
                charts.paymentBreakdown = new window.Chart(paymentBreakdownCanvas, {
                    type: 'doughnut',
                    data: {
                        labels,
                        datasets: [
                            {
                                data: amounts,
                                backgroundColor: palette,
                                borderWidth: 0
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: { usePointStyle: true }
                            },
                            tooltip: {
                                callbacks: {
                                    label: (context) => {
                                        const value = context.parsed;
                                        const total = context.dataset.data.reduce((acc, item) => acc + item, 0);
                                        const percent = total ? ((value / total) * 100).toFixed(1) : '0.0';
                                        return `${context.label}: ${formatCurrency(value)} (${percent}%)`;
                                    }
                                }
                            }
                        }
                    }
                });
            }
        }
    };

    const updateTopProducts = (payload = {}) => {
        const items = Array.isArray(payload.items) ? payload.items : [];
        const topItems = items.slice(0, 10);

        if (topSummaryFields.quantity) {
            topSummaryFields.quantity.textContent = formatNumber(payload.totals ? payload.totals.quantity || 0 : 0);
        }
        if (topSummaryFields.revenue) {
            topSummaryFields.revenue.textContent = formatCurrency(payload.totals ? payload.totals.revenue || 0 : 0);
        }

        renderTopProductsTable(topItems);

        if (!topProductsCanvas) {
            return;
        }

        if (!topItems.length) {
            destroyChart('topProducts');
            return;
        }

        const labels = topItems.map((item) => item.name || 'Produto');
        const revenues = topItems.map((item) => Number(item.revenue) || 0);

        destroyChart('topProducts');
        charts.topProducts = new window.Chart(topProductsCanvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Receita líquida',
                        data: revenues,
                        backgroundColor: colors.primary,
                        borderRadius: 10,
                        maxBarThickness: 32
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: {
                        ticks: {
                            callback: (value) => currencyFormatter.format(value)
                        }
                    },
                    y: {
                        ticks: {
                            autoSkip: false
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.x)}`
                        }
                    }
                }
            }
        });
    };

    const updateHourlyMovement = (payload = {}) => {
        const hours = Array.isArray(payload.hours) ? payload.hours : [];

        if (hourlyHighlight) {
            const busiest = payload.highlights && payload.highlights.busiestHour ? payload.highlights.busiestHour : null;
            if (busiest && busiest.orders > 0) {
                hourlyHighlight.textContent = `Horário de pico: ${busiest.label}`;
            } else {
                hourlyHighlight.textContent = 'Horário de pico: --';
            }
        }

        renderHourlyInsights(payload);

        if (!hourlyMovementCanvas) {
            return;
        }

        if (!hours.length) {
            destroyChart('hourlyMovement');
            return;
        }

        const labels = hours.map((item) => item.label || '--');
        const revenueData = hours.map((item) => Number(item.revenue) || 0);
        const ordersData = hours.map((item) => Number(item.orders) || 0);

        destroyChart('hourlyMovement');
        charts.hourlyMovement = new window.Chart(hourlyMovementCanvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        type: 'bar',
                        label: 'Receita',
                        data: revenueData,
                        backgroundColor: colors.primary,
                        borderRadius: 8,
                        yAxisID: 'revenue',
                        maxBarThickness: 24
                    },
                    {
                        type: 'line',
                        label: 'Pedidos',
                        data: ordersData,
                        borderColor: colors.secondary,
                        backgroundColor: colors.secondary,
                        borderWidth: 2,
                        fill: false,
                        tension: 0.25,
                        yAxisID: 'orders'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                scales: {
                    revenue: {
                        type: 'linear',
                        position: 'left',
                        ticks: {
                            callback: (value) => currencyFormatter.format(value)
                        }
                    },
                    orders: {
                        type: 'linear',
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        ticks: {
                            callback: (value) => numberFormatter.format(value),
                            precision: 0
                        }
                    }
                },
                plugins: {
                    legend: { display: true },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const value = context.parsed.y;
                                return context.dataset.yAxisID === 'revenue'
                                    ? `${context.dataset.label}: ${formatCurrency(value)}`
                                    : `${context.dataset.label}: ${formatNumber(value)}`;
                            }
                        }
                    }
                }
            }
        });
    };

    const updateDailyMovement = (payload = {}) => {
        const days = Array.isArray(payload.days) ? payload.days : [];

        if (dailyHighlight) {
            const best = payload.highlights && payload.highlights.bestDay ? payload.highlights.bestDay : null;
            if (best && best.revenue > 0) {
                dailyHighlight.textContent = `Dia de maior receita: ${formatDateLabel(best.date)}`;
            } else {
                dailyHighlight.textContent = 'Dia de maior receita: --';
            }
        }

        renderDailyInsights(payload);

        if (!dailyMovementCanvas) {
            return;
        }

        if (!days.length) {
            destroyChart('dailyMovement');
            return;
        }

        const labels = days.map((item) => formatDateLabel(item.date));
        const revenueData = days.map((item) => Number(item.revenue) || 0);
        const ordersData = days.map((item) => Number(item.orders) || 0);

        destroyChart('dailyMovement');
        charts.dailyMovement = new window.Chart(dailyMovementCanvas, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Receita',
                        data: revenueData,
                        borderColor: colors.primary,
                        backgroundColor: colors.primarySoft,
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3,
                        yAxisID: 'revenue'
                    },
                    {
                        label: 'Pedidos',
                        data: ordersData,
                        borderColor: colors.secondary,
                        borderDash: [6, 6],
                        borderWidth: 2,
                        fill: false,
                        tension: 0.3,
                        yAxisID: 'orders'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                scales: {
                    revenue: {
                        type: 'linear',
                        position: 'left',
                        ticks: {
                            callback: (value) => currencyFormatter.format(value)
                        }
                    },
                    orders: {
                        type: 'linear',
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        ticks: {
                            callback: (value) => numberFormatter.format(value),
                            precision: 0
                        }
                    }
                },
                plugins: {
                    legend: { display: true },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const value = context.parsed.y;
                                return context.dataset.yAxisID === 'revenue'
                                    ? `${context.dataset.label}: ${formatCurrency(value)}`
                                    : `${context.dataset.label}: ${formatNumber(value)}`;
                            }
                        }
                    }
                }
            }
        });
    };

    const updateStock = (payload = {}) => {
        const summary = payload.summary || {};
        if (stockSummaryFields.totalActive) {
            stockSummaryFields.totalActive.textContent = formatNumber(summary.totalActive || 0);
        }
        if (stockSummaryFields.lowStock) {
            stockSummaryFields.lowStock.textContent = formatNumber(summary.lowStock || 0);
        }
        if (stockSummaryFields.outOfStock) {
            stockSummaryFields.outOfStock.textContent = formatNumber(summary.outOfStock || 0);
        }
        if (stockSummaryFields.adequateStock) {
            stockSummaryFields.adequateStock.textContent = formatNumber(summary.adequateStock || 0);
        }

        renderStockTable(payload.items || []);
    };

    const fetchReport = async (endpoint) => {
        const params = new URLSearchParams({ range: state.range });
        const response = await fetch(`${endpoint}?${params.toString()}`, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        if (response.status === 401) {
            const error = new Error('UNAUTHORIZED');
            error.code = 'UNAUTHORIZED';
            throw error;
        }

        if (!response.ok) {
            throw new Error(`Falha ao carregar ${endpoint}: ${response.status}`);
        }

        return response.json();
    };

    const loadReports = async () => {
        if (state.isFetching) {
            return;
        }

        state.isFetching = true;
        setLoading(true);
        clearAlert();

        try {
            const [overview, topProducts, hourly, daily, stock] = await Promise.all([
                fetchReport(endpoints.overview),
                fetchReport(endpoints.topProducts),
                fetchReport(endpoints.hourly),
                fetchReport(endpoints.daily),
                fetchReport(endpoints.stock)
            ]);

            updateOverview(overview || {});
            updateTopProducts(topProducts || {});
            updateHourlyMovement(hourly || {});
            updateDailyMovement(daily || {});
            updateStock(stock || {});
            updateTimestamp((overview && overview.generatedAt) || new Date().toISOString());
        } catch (error) {
            console.error('Erro ao carregar relatórios do PDV:', error);
            if (error.code === 'UNAUTHORIZED') {
                showAlert('Sua sessão expirou. Faça login novamente para acessar os relatórios do PDV.');
            } else {
                showAlert('Não foi possível carregar os relatórios do PDV. Tente novamente em instantes.');
            }
        } finally {
            setLoading(false);
            state.isFetching = false;
        }
    };

    const scheduleAutoRefresh = () => {
        if (state.autoRefreshId) {
            window.clearInterval(state.autoRefreshId);
        }
        state.autoRefreshId = window.setInterval(() => {
            if (!state.isFetching && document.visibilityState === 'visible') {
                loadReports();
            }
        }, 4 * 60 * 1000);
    };

    if (rangeSelect) {
        rangeSelect.value = state.range;
        rangeSelect.addEventListener('change', () => {
            state.range = rangeSelect.value || state.range;
            loadReports();
        });
    }

    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            loadReports();
        });
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            loadReports();
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        loadReports();
        scheduleAutoRefresh();
    });
})();
