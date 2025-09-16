(function () {
    const root = document.getElementById('dashboardRoot');
    if (!root) {
        return;
    }

    const summaryFields = {
        appointmentsToday: root.querySelector('[data-metric="appointmentsToday"]'),
        upcomingWeek: root.querySelector('[data-metric="upcomingWeek"]'),
        monthlyRevenue: root.querySelector('[data-metric="monthlyRevenue"]'),
        pendingPayables: root.querySelector('[data-metric="pendingPayables"]'),
        activeUsers: root.querySelector('[data-metric="activeUsers"]'),
        newUsersMonth: root.querySelector('[data-submetric="newUsersMonth"]')
    };

    const alertBox = root.querySelector('[data-dashboard-alert]');
    const upcomingList = root.querySelector('[data-upcoming-list]');
    const refreshButton = document.getElementById('refreshDashboard');
    const updatedAt = root.querySelector('[data-dashboard-updated]');

    const financeCanvas = document.getElementById('financeTrendChart');
    const appointmentCanvas = document.getElementById('appointmentStatusChart');
    const userGrowthCanvas = document.getElementById('userGrowthChart');

    const charts = {
        financeTrend: null,
        appointmentStatus: null,
        userGrowth: null
    };

    const numberFormatter = new Intl.NumberFormat('pt-BR');
    const currencyFormatter = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2
    });

    const statusLabels = {
        scheduled: 'Agendado',
        'pending-confirmation': 'Pendente',
        completed: 'Concluído',
        cancelled: 'Cancelado',
        'no-show': 'Faltou'
    };

    const statusBadgeClass = {
        scheduled: 'badge bg-primary-subtle text-primary',
        'pending-confirmation': 'badge bg-warning-subtle text-warning',
        completed: 'badge bg-success-subtle text-success',
        cancelled: 'badge bg-secondary-subtle text-secondary',
        'no-show': 'badge bg-danger-subtle text-danger'
    };

    let isFetching = false;
    let refreshIntervalId;

    const formatNumber = (value) => numberFormatter.format(Number(value) || 0);
    const formatCurrency = (value) => currencyFormatter.format(Number(value) || 0);

    const formatDateTime = (value) => {
        if (!value) {
            return '--';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '--';
        }
        return date.toLocaleString('pt-BR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
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

    const toggleRefreshing = (state) => {
        if (!refreshButton) {
            return;
        }
        if (state) {
            refreshButton.disabled = true;
            if (!refreshButton.dataset.originalContent) {
                refreshButton.dataset.originalContent = refreshButton.innerHTML;
            }
            refreshButton.innerHTML = `
                <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Atualizando...
            `;
        } else {
            refreshButton.disabled = false;
            if (refreshButton.dataset.originalContent) {
                refreshButton.innerHTML = refreshButton.dataset.originalContent;
            }
        }
    };

    const destroyChart = (chartInstance) => {
        if (chartInstance && typeof chartInstance.destroy === 'function') {
            chartInstance.destroy();
        }
    };

    const buildLineChart = (canvas, data, config = {}) => {
        if (!canvas) {
            return null;
        }
        const context = canvas.getContext('2d');
        return new Chart(context, {
            type: 'line',
            data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (tooltipItem) => {
                                const datasetLabel = tooltipItem.dataset.label || '';
                                const value = tooltipItem.raw;
                                if (config.valueType === 'currency') {
                                    return `${datasetLabel}: ${formatCurrency(value)}`;
                                }
                                return `${datasetLabel}: ${formatNumber(value)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => (config.valueType === 'currency' ? formatCurrency(value) : formatNumber(value))
                        }
                    }
                }
            }
        });
    };

    const buildDoughnutChart = (canvas, data) => {
        if (!canvas) {
            return null;
        }
        const context = canvas.getContext('2d');
        return new Chart(context, {
            type: 'doughnut',
            data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            usePointStyle: true
                        }
                    }
                }
            }
        });
    };

    const updateSummary = (summary = {}) => {
        if (summaryFields.appointmentsToday) {
            summaryFields.appointmentsToday.textContent = formatNumber(summary.appointmentsToday);
        }
        if (summaryFields.upcomingWeek) {
            summaryFields.upcomingWeek.textContent = formatNumber(summary.upcomingWeek);
        }
        if (summaryFields.monthlyRevenue) {
            summaryFields.monthlyRevenue.textContent = formatCurrency(summary.monthlyRevenue);
        }
        if (summaryFields.pendingPayables) {
            summaryFields.pendingPayables.textContent = formatCurrency(summary.pendingPayables);
        }
        if (summaryFields.activeUsers) {
            summaryFields.activeUsers.textContent = formatNumber(summary.activeUsers);
        }
        if (summaryFields.newUsersMonth) {
            const newUsers = Number(summary.newUsersInMonth) || 0;
            summaryFields.newUsersMonth.textContent = `${newUsers >= 0 ? '+' : ''}${formatNumber(newUsers)} novos neste mês`;
        }
    };

    const updateCharts = (chartsData = {}) => {
        if (chartsData.financeTrend && financeCanvas) {
            destroyChart(charts.financeTrend);
            charts.financeTrend = buildLineChart(financeCanvas, chartsData.financeTrend, { valueType: 'currency' });
        }

        if (chartsData.appointmentStatus && appointmentCanvas) {
            destroyChart(charts.appointmentStatus);
            charts.appointmentStatus = buildDoughnutChart(appointmentCanvas, chartsData.appointmentStatus);
        }

        if (chartsData.userGrowth && userGrowthCanvas) {
            destroyChart(charts.userGrowth);
            charts.userGrowth = buildLineChart(userGrowthCanvas, chartsData.userGrowth, { valueType: 'number' });
        }
    };

    const renderUpcomingAppointments = (appointments = []) => {
        if (!upcomingList) {
            return;
        }

        upcomingList.innerHTML = '';

        if (!appointments.length) {
            const emptyItem = document.createElement('li');
            emptyItem.className = 'text-muted small';
            emptyItem.textContent = 'Nenhum atendimento futuro cadastrado.';
            upcomingList.appendChild(emptyItem);
            return;
        }

        appointments.forEach((appointment) => {
            const item = document.createElement('li');
            item.className = 'upcoming-item';

            const title = document.createElement('div');
            title.className = 'fw-semibold mb-1';
            title.textContent = appointment.description || 'Agendamento sem descrição';
            item.appendChild(title);

            const meta = document.createElement('div');
            meta.className = 'upcoming-meta';
            meta.textContent = formatDateTime(appointment.start);
            item.appendChild(meta);

            const footer = document.createElement('div');
            footer.className = 'd-flex align-items-center gap-2 flex-wrap';

            const statusBadge = document.createElement('span');
            statusBadge.className = statusBadgeClass[appointment.status] || 'badge bg-light text-muted';
            statusBadge.textContent = statusLabels[appointment.status] || 'Status indefinido';
            footer.appendChild(statusBadge);

            if (appointment.professional?.name) {
                const professionalTag = document.createElement('span');
                professionalTag.className = 'text-muted small d-inline-flex align-items-center gap-1';

                const icon = document.createElement('i');
                icon.className = 'bi bi-person-workspace';
                professionalTag.appendChild(icon);

                const nameNode = document.createElement('span');
                nameNode.textContent = appointment.professional.name;
                professionalTag.appendChild(nameNode);

                footer.appendChild(professionalTag);
            }

            item.appendChild(footer);
            upcomingList.appendChild(item);
        });
    };

    const refreshTimestamp = (timestamp) => {
        if (!updatedAt) {
            return;
        }
        const reference = timestamp ? new Date(timestamp) : new Date();
        if (Number.isNaN(reference.getTime())) {
            updatedAt.textContent = '--';
            return;
        }
        updatedAt.textContent = reference.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const loadDashboardData = async () => {
        if (isFetching) {
            return;
        }
        isFetching = true;
        root.classList.add('is-loading');
        root.setAttribute('aria-busy', 'true');
        toggleRefreshing(true);
        clearAlert();

        try {
            const response = await fetch('/dashboard/data', {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            if (response.status === 403) {
                showAlert('Seu usuário não possui permissão para acessar o painel.');
                return;
            }

            if (!response.ok) {
                throw new Error(`Falha ao carregar dados: ${response.status}`);
            }

            const payload = await response.json();
            updateSummary(payload.summary || {});
            updateCharts(payload.charts || {});
            renderUpcomingAppointments(payload.upcomingAppointments || []);
            refreshTimestamp(payload.generatedAt);
        } catch (error) {
            console.error('Erro ao atualizar o dashboard:', error);
            showAlert('Não foi possível carregar os dados do painel. Tente novamente em instantes.');
        } finally {
            toggleRefreshing(false);
            root.classList.remove('is-loading');
            root.setAttribute('aria-busy', 'false');
            isFetching = false;
        }
    };

    const scheduleAutoRefresh = () => {
        if (refreshIntervalId) {
            clearInterval(refreshIntervalId);
        }
        refreshIntervalId = window.setInterval(() => {
            if (!isFetching) {
                loadDashboardData();
            }
        }, 5 * 60 * 1000);
    };

    document.addEventListener('DOMContentLoaded', () => {
        loadDashboardData();
        scheduleAutoRefresh();

        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                loadDashboardData();
            });
        }
    });
})();
