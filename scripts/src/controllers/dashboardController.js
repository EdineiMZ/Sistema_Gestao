const { Appointment, FinanceEntry, User, sequelize, Sequelize } = require('../../database/models');
const financeReportingService = require('../services/financeReportingService');
const { Op } = Sequelize;

const toNumber = (value) => {
    if (value === null || value === undefined) {
        return 0;
    }
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

const buildMonthBuckets = (months, referenceDate = new Date()) => {
    const buckets = [];
    for (let i = months - 1; i >= 0; i -= 1) {
        const current = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - i, 1);
        buckets.push({
            key: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`,
            label: current.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
        });
    }
    return buckets;
};

const resolveMonthKey = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const normalizeDate = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

module.exports = {
    renderDashboard: (req, res) => {
        res.render('dashboard/index', {
            pageTitle: 'Painel gerencial'
        });
    },

    fetchDashboardData: async (req, res) => {
        try {
            const now = new Date();
            const todayStart = startOfDay(now);
            const todayEnd = endOfDay(now);
            const monthStart = startOfMonth(now);
            const monthEnd = endOfMonth(now);
            const monthBuckets = buildMonthBuckets(6, now);
            const earliestBucketDate = new Date(now.getFullYear(), now.getMonth() - (monthBuckets.length - 1), 1);

            const [
                appointmentsToday,
                upcomingWeek,
                monthlyRevenueRaw,
                pendingPayablesRaw,
                activeUsers,
                newUsersInMonth,
                statusAggregations,
                financeEntries,
                userGrowthEntries,
                upcomingAppointments
            ] = await Promise.all([
                Appointment.count({
                    where: {
                        start: {
                            [Op.gte]: todayStart,
                            [Op.lt]: todayEnd
                        }
                    }
                }),
                Appointment.count({
                    where: {
                        start: {
                            [Op.gte]: now,
                            [Op.lt]: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7)
                        },
                        status: {
                            [Op.in]: ['scheduled', 'pending-confirmation']
                        }
                    }
                }),
                FinanceEntry.sum('value', {
                    where: {
                        type: 'receivable',
                        status: 'paid',
                        paymentDate: {
                            [Op.gte]: monthStart,
                            [Op.lte]: monthEnd
                        }
                    }
                }),
                FinanceEntry.sum('value', {
                    where: {
                        type: 'payable',
                        status: {
                            [Op.in]: ['pending', 'overdue']
                        },
                        dueDate: {
                            [Op.gte]: monthStart,
                            [Op.lte]: monthEnd
                        }
                    }
                }),
                User.count({ where: { active: true } }),
                User.unscoped().count({
                    where: {
                        createdAt: {
                            [Op.gte]: monthStart,
                            [Op.lte]: monthEnd
                        }
                    }
                }),
                Appointment.findAll({
                    attributes: [
                        'status',
                        [sequelize.fn('COUNT', sequelize.col('status')), 'total']
                    ],
                    where: {
                        start: {
                            [Op.gte]: monthStart
                        }
                    },
                    group: ['status'],
                    raw: true
                }),
                FinanceEntry.findAll({
                    attributes: ['type', 'status', 'value', 'paymentDate', 'dueDate', 'createdAt', 'recurring', 'recurringInterval'],
                    where: {
                        [Op.or]: [
                            { paymentDate: { [Op.gte]: earliestBucketDate } },
                            { dueDate: { [Op.gte]: earliestBucketDate } },
                            { createdAt: { [Op.gte]: earliestBucketDate } }
                        ]
                    },
                    raw: true
                }),
                User.unscoped().findAll({
                    attributes: ['createdAt'],
                    where: {
                        createdAt: {
                            [Op.gte]: earliestBucketDate
                        }
                    },
                    raw: true
                }),
                Appointment.findAll({
                    where: {
                        start: {
                            [Op.gte]: now
                        }
                    },
                    include: [
                        {
                            model: User,
                            as: 'professional',
                            attributes: ['id', 'name', 'role']
                        }
                    ],
                    order: [['start', 'ASC']],
                    limit: 6
                })
            ]);

            const monthlyRevenue = toNumber(monthlyRevenueRaw);
            const pendingPayables = toNumber(pendingPayablesRaw);

            const statusLabels = {
                scheduled: 'Agendado',
                'pending-confirmation': 'Pendente',
                completed: 'Concluído',
                cancelled: 'Cancelado',
                'no-show': 'Faltou'
            };

            const statusMap = statusAggregations.reduce((acc, row) => {
                acc[row.status] = Number.parseInt(row.total, 10) || 0;
                return acc;
            }, {});

            const appointmentStatusChart = {
                labels: Object.keys(statusLabels).map((key) => statusLabels[key]),
                datasets: [
                    {
                        label: 'Distribuição de status',
                        data: Object.keys(statusLabels).map((key) => statusMap[key] || 0),
                        backgroundColor: ['#4361ee', '#4895ef', '#2ec4b6', '#f9c74f', '#f94144'],
                        borderWidth: 0
                    }
                ]
            };

            const monthKeys = monthBuckets.map((bucket) => bucket.key);
            const receivableSeries = monthBuckets.map(() => 0);
            const payableSeries = monthBuckets.map(() => 0);

            financeEntries.forEach((entry) => {
                const referenceDate = normalizeDate(entry.paymentDate) || normalizeDate(entry.dueDate) || normalizeDate(entry.createdAt);
                const monthKey = resolveMonthKey(referenceDate);
                if (!monthKey) {
                    return;
                }
                const monthIndex = monthKeys.indexOf(monthKey);
                if (monthIndex === -1) {
                    return;
                }
                const value = toNumber(entry.value);
                if (entry.type === 'receivable') {
                    if (entry.status === 'paid') {
                        receivableSeries[monthIndex] += value;
                    }
                } else if (entry.type === 'payable') {
                    if (['pending', 'overdue', 'paid'].includes(entry.status)) {
                        payableSeries[monthIndex] += value;
                    }
                }
            });

            const financeTrendChart = {
                labels: monthBuckets.map((bucket) => bucket.label),
                datasets: [
                    {
                        label: 'Receitas confirmadas',
                        data: receivableSeries.map((value) => Number(value.toFixed(2))),
                        borderColor: '#2ec4b6',
                        backgroundColor: 'rgba(46, 196, 182, 0.25)',
                        tension: 0.35,
                        fill: true
                    },
                    {
                        label: 'Despesas monitoradas',
                        data: payableSeries.map((value) => Number(value.toFixed(2))),
                        borderColor: '#f3722c',
                        backgroundColor: 'rgba(243, 114, 44, 0.22)',
                        tension: 0.35,
                        fill: true
                    }
                ]
            };

            const userGrowthSeries = monthBuckets.map(() => 0);
            userGrowthEntries.forEach((entry) => {
                const monthKey = resolveMonthKey(entry.createdAt);
                if (!monthKey) {
                    return;
                }
                const index = monthKeys.indexOf(monthKey);
                if (index !== -1) {
                    userGrowthSeries[index] += 1;
                }
            });

            const userGrowthChart = {
                labels: monthBuckets.map((bucket) => bucket.label),
                datasets: [
                    {
                        label: 'Novos usuários',
                        data: userGrowthSeries,
                        borderColor: '#4361ee',
                        backgroundColor: 'rgba(67, 97, 238, 0.22)',
                        tension: 0.35,
                        fill: true
                    }
                ]
            };

            const upcomingPayload = upcomingAppointments.map((appointment) => ({
                id: appointment.id,
                description: appointment.description,
                start: appointment.start,
                status: appointment.status,
                professional: appointment.professional ? {
                    id: appointment.professional.id,
                    name: appointment.professional.name,
                    role: appointment.professional.role
                } : null
            }));

            const projectionMonths = await financeReportingService.getMonthlyProjection(
                { projectionMonths: 6, referenceDate: now },
                { entries: financeEntries }
            );

            const projectionHighlight = projectionMonths.find((item) => item.isFuture && item.hasGoal)
                || projectionMonths.find((item) => item.isFuture)
                || projectionMonths.find((item) => item.isCurrent)
                || null;

            const projectionWarnings = projectionMonths.filter((item) => item.needsAttention);

            return res.json({
                summary: {
                    appointmentsToday,
                    upcomingWeek,
                    monthlyRevenue,
                    pendingPayables,
                    activeUsers,
                    newUsersInMonth
                },
                charts: {
                    appointmentStatus: appointmentStatusChart,
                    financeTrend: financeTrendChart,
                    userGrowth: userGrowthChart
                },
                upcomingAppointments: upcomingPayload,
                projections: {
                    months: projectionMonths,
                    highlight: projectionHighlight,
                    warnings: projectionWarnings.map((item) => ({
                        month: item.month,
                        label: item.label,
                        gapToGoal: item.goal?.gapToGoal ?? null
                    }))
                },
                generatedAt: now.toISOString()
            });
        } catch (error) {
            console.error('Erro ao carregar dados do dashboard:', error);
            return res.status(500).json({ message: 'Não foi possível carregar os dados do painel.' });
        }
    }
};
