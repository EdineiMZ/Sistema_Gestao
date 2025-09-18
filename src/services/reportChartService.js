'use strict';

let ChartJSNodeCanvas;
let chartRuntimeAvailable = true;

try {
    require('chart.js/auto');
    ({ ChartJSNodeCanvas } = require('chartjs-node-canvas'));
} catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND' && /chart\.js/.test(error?.message || '')) {
        chartRuntimeAvailable = false;
        ChartJSNodeCanvas = null;
        console.warn(
            'Biblioteca Chart.js não encontrada. A geração de gráficos financeiros será desabilitada.'
        );
    } else {
        throw error;
    }
}

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 400;
const DEFAULT_BACKGROUND = '#FFFFFF';

const canvasCache = new Map();

const numberFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const toNumber = (value) => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (value) => numberFormatter.format(toNumber(value));

const formatMonthLabel = (value) => {
    if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)) {
        const [year, month] = value.split('-').map((part) => Number.parseInt(part, 10));
        if (Number.isFinite(year) && Number.isFinite(month)) {
            const date = new Date(Date.UTC(year, month - 1, 1));
            if (Number.isFinite(date.getTime())) {
                return date.toLocaleDateString('pt-BR', {
                    month: 'short',
                    year: 'numeric'
                });
            }
        }
    }

    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value.toLocaleDateString('pt-BR', {
            month: 'short',
            year: 'numeric'
        });
    }

    if (value === null || value === undefined) {
        return '—';
    }

    return String(value).trim() || '—';
};

const getRenderer = (options = {}) => {
    const width = Number.isFinite(options.width) && options.width > 0
        ? Math.floor(options.width)
        : DEFAULT_WIDTH;
    const height = Number.isFinite(options.height) && options.height > 0
        ? Math.floor(options.height)
        : DEFAULT_HEIGHT;
    const background = typeof options.backgroundColour === 'string' && options.backgroundColour.trim()
        ? options.backgroundColour
        : typeof options.backgroundColor === 'string' && options.backgroundColor.trim()
            ? options.backgroundColor
            : DEFAULT_BACKGROUND;

    const cacheKey = `${width}x${height}:${background}`;

    if (!canvasCache.has(cacheKey)) {
        canvasCache.set(cacheKey, new ChartJSNodeCanvas({
            width,
            height,
            backgroundColour: background,
            chartCallback: (chartJS) => {
                chartJS.defaults.font.family = 'sans-serif';
                chartJS.defaults.color = '#1F2937';
            }
        }));
    }

    return {
        renderer: canvasCache.get(cacheKey),
        width,
        height
    };
};

const buildChartConfiguration = (summary = {}, options = {}) => {
    const monthlySummary = Array.isArray(summary?.monthlySummary) ? summary.monthlySummary : [];

    if (!monthlySummary.length) {
        return null;
    }

    const labels = monthlySummary.map((item) => formatMonthLabel(item?.month));
    const payableData = monthlySummary.map((item) => toNumber(item?.payable));
    const receivableData = monthlySummary.map((item) => toNumber(item?.receivable));

    const hasRelevantData = payableData.some((value) => value !== 0) || receivableData.some((value) => value !== 0);

    if (!hasRelevantData) {
        return null;
    }

    const title = typeof options.title === 'string' && options.title.trim()
        ? options.title.trim()
        : 'Fluxo Mensal de Pagamentos e Recebimentos';

    return {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'A Receber',
                    data: receivableData,
                    borderColor: '#2563EB',
                    backgroundColor: 'rgba(37, 99, 235, 0.25)',
                    pointBackgroundColor: '#1D4ED8',
                    pointBorderColor: '#FFFFFF',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    tension: 0.35,
                    fill: true
                },
                {
                    label: 'A Pagar',
                    data: payableData,
                    borderColor: '#F97316',
                    backgroundColor: 'rgba(249, 115, 22, 0.25)',
                    pointBackgroundColor: '#C2410C',
                    pointBorderColor: '#FFFFFF',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    tension: 0.35,
                    fill: true
                }
            ]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 16,
                    right: 24,
                    bottom: 16,
                    left: 24
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#1F2937',
                        font: {
                            family: 'sans-serif',
                            size: 12,
                            weight: '600'
                        },
                        usePointStyle: true,
                        padding: 16
                    }
                },
                title: {
                    display: true,
                    text: title,
                    color: '#111827',
                    font: {
                        family: 'sans-serif',
                        size: 18,
                        weight: '700'
                    },
                    padding: {
                        bottom: 12
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const value = toNumber(context?.parsed?.y);
                            return `${context.dataset.label}: ${formatCurrency(value)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#374151',
                        font: {
                            family: 'sans-serif'
                        }
                    },
                    grid: {
                        color: 'rgba(209, 213, 219, 0.4)'
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#374151',
                        font: {
                            family: 'sans-serif'
                        },
                        callback: (value) => formatCurrency(value)
                    },
                    grid: {
                        color: 'rgba(209, 213, 219, 0.25)'
                    }
                }
            }
        }
    };
};

const generateFinanceReportChart = async (summary = {}, options = {}) => {
    if (!chartRuntimeAvailable || !ChartJSNodeCanvas) {
        return null;
    }

    const chartConfiguration = buildChartConfiguration(summary, options);

    if (!chartConfiguration) {
        return null;
    }

    const { renderer, width, height } = getRenderer(options);
    const buffer = await renderer.renderToBuffer(chartConfiguration, 'image/png');

    return {
        buffer,
        width,
        height,
        dataUrl: `data:image/png;base64,${buffer.toString('base64')}`
    };
};

module.exports = {
    generateFinanceReportChart,
    utils: {
        formatMonthLabel,
        buildChartConfiguration
    }
};
