'use strict';

const { getBudgetThresholdDefaults, isBudgetAlertEnabled } = require('../../config/default');

const FALLBACK_THRESHOLD_PRESET = Object.freeze([0.5, 0.75, 0.9]);

/**
 * Retorna os limites padrão configurados ou o fallback.
 */
const getConfiguredThresholdDefaults = () => {
    const configured = getBudgetThresholdDefaults();
    if (Array.isArray(configured) && configured.length) {
        return configured.slice().sort((a, b) => a - b);
    }

    if (!isBudgetAlertEnabled()) {
        return [];
    }

    return FALLBACK_THRESHOLD_PRESET.slice();
};

/**
 * Normaliza valores de mês para formato YYYY-MM-DD (primeiro dia do mês).
 */
const normalizeMonthValue = (value) => {
    if (!value) return null;

    let reference;

    if (value instanceof Date) {
        reference = value;
    } else if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;

        if (/^\d{4}-\d{2}$/.test(trimmed)) {
            reference = new Date(`${trimmed}-01T00:00:00Z`);
        } else {
            reference = new Date(trimmed);
        }
    } else if (typeof value === 'number') {
        reference = new Date(value);
    }

    if (!(reference instanceof Date) || Number.isNaN(reference.getTime())) {
        return null;
    }

    const normalized = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
    return normalized.toISOString().slice(0, 10);
};

const THRESHOLD_RANGE_ERROR = 'Limiares devem ser números entre 0 e 1, com até duas casas decimais.';

/**
 * Normaliza a lista de limiares (thresholds).
 */
const normalizeThresholds = (value) => {
    if (value === undefined || value === null) {
        return getConfiguredThresholdDefaults();
    }

    const rawList = Array.isArray(value) ? value : [value];
    if (rawList.length === 0) {
        return [];
    }

    const normalized = rawList
        .map((item) => {
            const numeric = Number.parseFloat(
                typeof item === 'string' ? item.replace(',', '.') : item
            );
            if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1) {
                return null;
            }
            return Number(numeric.toFixed(4));
        })
        .filter((item) => item !== null);

    if (!normalized.length) {
        return getConfiguredThresholdDefaults();
    }

    if (normalized.some((n) => n <= 0 || n > 1)) {
        throw new Error(THRESHOLD_RANGE_ERROR);
    }

    return normalized;
};

/**
 * Resolve valores de thresholds, caindo para o padrão se necessário.
 */
const resolveThresholdValues = (value) => {
    const thresholds = normalizeThresholds(value);
    if (Array.isArray(thresholds) && thresholds.length) {
        return thresholds;
    }
    return getConfiguredThresholdDefaults();
};

module.exports = (sequelize, DataTypes) => {
    const Budget = sequelize.define(
        'Budget',
        {
            monthlyLimit: {
                type: DataTypes.DECIMAL(12, 2),
                allowNull: false,
                validate: {
                    isPositive(value) {
                        const numeric = Number(value);
                        if (!Number.isFinite(numeric) || numeric <= 0) {
                            throw new Error('Limite mensal deve ser maior que zero.');
                        }
                    },
                },
            },
            thresholds: {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: () => getConfiguredThresholdDefaults(),
                set(value) {
                    this.setDataValue('thresholds', resolveThresholdValues(value));
                },
                get() {
                    const value = this.getDataValue('thresholds');
                    return Array.isArray(value) ? value : [];
                },
                validate: {
                    isArrayOfPositiveNumbers(value) {
                        const list = normalizeThresholds(value);
                        if (list.some((item) => item <= 0 || item > 1)) {
                            throw new Error(
                                'Percentuais de alerta devem estar entre 0 e 1 (ex.: 0.75).'
                            );
                        }
                    },
                },
            },
            referenceMonth: {
                type: DataTypes.DATEONLY,
                allowNull: true,
                validate: {
                    isDate: {
                        msg: 'Mês de referência inválido.',
                    },
                },
            },
            userId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            financeCategoryId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
        },
        {
            tableName: 'Budgets',
            indexes: [
                {
                    name: 'budgets_user_category_unique',
                    unique: true,
                    fields: ['userId', 'financeCategoryId'],
                },
                {
                    name: 'budgets_category_idx',
                    fields: ['financeCategoryId'],
                },
            ],
        }
    );

    Budget.addHook('beforeValidate', (budget) => {
        if (!budget) return;

        const normalizedMonth = normalizeMonthValue(budget.referenceMonth);
        if (normalizedMonth) {
            budget.referenceMonth = normalizedMonth;
        }

        budget.thresholds = resolveThresholdValues(budget.thresholds);
    });

    // Métodos estáticos auxiliares
    Budget.normalizeThresholds = normalizeThresholds;
    Budget.getThresholdDefaults = getConfiguredThresholdDefaults;
    Budget.resolveThresholdValues = resolveThresholdValues;

    // Associações
    Budget.associate = (models) => {
        Budget.belongsTo(models.User, {
            as: 'user',
            foreignKey: 'userId',
        });

        Budget.belongsTo(models.FinanceCategory, {
            as: 'category',
            foreignKey: 'financeCategoryId',
        });

        if (models.BudgetThresholdLog) {
            Budget.hasMany(models.BudgetThresholdLog, {
                as: 'thresholdLogs',
                foreignKey: 'budgetId',
                onDelete: 'CASCADE',
                hooks: true,
            });
        }
    };

    return Budget;
};
