'use strict';

const RATE_PERIODS = new Set(['annual', 'monthly', 'quarterly', 'weekly', 'daily']);
const CONTRIBUTION_FREQUENCIES = new Set(['monthly', 'quarterly', 'yearly', 'weekly']);

const normalizeRate = (value) => {
    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
        return 0;
    }
    return numeric;
};

const normalizeContribution = (value) => {
    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
        return 0;
    }
    return numeric;
};

module.exports = (sequelize, DataTypes) => {
    const FinanceCategoryRate = sequelize.define('FinanceCategoryRate', {
        userId: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        financeCategoryId: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        ratePeriod: {
            type: DataTypes.STRING(16),
            allowNull: false,
            defaultValue: 'annual',
            validate: {
                isValid(value) {
                    if (value && !RATE_PERIODS.has(String(value).toLowerCase())) {
                        throw new Error('Período de taxa inválido.');
                    }
                }
            },
            set(value) {
                const normalized = typeof value === 'string' ? value.toLowerCase() : 'annual';
                this.setDataValue('ratePeriod', RATE_PERIODS.has(normalized) ? normalized : 'annual');
            }
        },
        simpleRate: {
            type: DataTypes.DECIMAL(10, 6),
            allowNull: false,
            defaultValue: 0,
            set(value) {
                this.setDataValue('simpleRate', normalizeRate(value));
            }
        },
        compoundRate: {
            type: DataTypes.DECIMAL(10, 6),
            allowNull: false,
            defaultValue: 0,
            set(value) {
                this.setDataValue('compoundRate', normalizeRate(value));
            }
        },
        contributionAmount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0,
            set(value) {
                this.setDataValue('contributionAmount', normalizeContribution(value));
            }
        },
        contributionFrequency: {
            type: DataTypes.STRING(16),
            allowNull: false,
            defaultValue: 'monthly',
            validate: {
                isValid(value) {
                    if (value && !CONTRIBUTION_FREQUENCIES.has(String(value).toLowerCase())) {
                        throw new Error('Frequência de aporte inválida.');
                    }
                }
            },
            set(value) {
                const normalized = typeof value === 'string' ? value.toLowerCase() : 'monthly';
                this.setDataValue(
                    'contributionFrequency',
                    CONTRIBUTION_FREQUENCIES.has(normalized) ? normalized : 'monthly'
                );
            }
        },
        periodMonths: {
            type: DataTypes.INTEGER,
            allowNull: true,
            validate: {
                isPositive(value) {
                    if (value === null || value === undefined || value === '') {
                        return;
                    }
                    const numeric = Number.parseInt(value, 10);
                    if (!Number.isFinite(numeric) || numeric <= 0) {
                        throw new Error('Período em meses deve ser um número positivo.');
                    }
                }
            },
            set(value) {
                if (value === null || value === undefined || value === '') {
                    this.setDataValue('periodMonths', null);
                    return;
                }
                const numeric = Number.parseInt(value, 10);
                this.setDataValue('periodMonths', Number.isFinite(numeric) && numeric > 0 ? numeric : null);
            }
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        tableName: 'FinanceCategoryRates'
    });

    FinanceCategoryRate.normalizeRate = normalizeRate;
    FinanceCategoryRate.normalizeContribution = normalizeContribution;

    FinanceCategoryRate.associate = (models) => {
        if (models.User) {
            FinanceCategoryRate.belongsTo(models.User, {
                as: 'user',
                foreignKey: 'userId',
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            });
        }

        if (models.FinanceCategory) {
            FinanceCategoryRate.belongsTo(models.FinanceCategory, {
                as: 'category',
                foreignKey: 'financeCategoryId',
                onDelete: 'SET NULL',
                onUpdate: 'CASCADE'
            });
        }
    };

    return FinanceCategoryRate;
};
