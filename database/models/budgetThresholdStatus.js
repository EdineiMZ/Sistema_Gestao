'use strict';

const normalizeMonthValue = (value) => {
    if (!value) {
        return null;
    }

    let reference;

    if (value instanceof Date) {
        reference = value;
    } else if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }

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

module.exports = (sequelize, DataTypes) => {
    const BudgetThresholdStatus = sequelize.define('BudgetThresholdStatus', {
        budgetId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        threshold: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            validate: {
                isDecimal: {
                    msg: 'Limite deve ser numérico.'
                }
            }
        },
        referenceMonth: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            validate: {
                isDate: {
                    msg: 'Mês de referência inválido.'
                }
            }
        },
        triggeredAt: {
            type: DataTypes.DATE,
            allowNull: false,
            validate: {
                isDate: {
                    msg: 'Data de disparo inválida.'
                }
            }
        }
    }, {
        tableName: 'BudgetThresholdStatuses',
        indexes: [
            {
                name: 'budget_threshold_statuses_unique_idx',
                unique: true,
                fields: ['budgetId', 'referenceMonth', 'threshold']
            },
            {
                name: 'budget_threshold_statuses_budget_idx',
                fields: ['budgetId']
            }
        ]
    });

    BudgetThresholdStatus.addHook('beforeValidate', (status) => {
        if (!status) {
            return;
        }

        const normalizedMonth = normalizeMonthValue(status.referenceMonth);
        if (normalizedMonth) {
            status.referenceMonth = normalizedMonth;
        }
    });

    BudgetThresholdStatus.normalizeMonthValue = normalizeMonthValue;

    BudgetThresholdStatus.associate = (models) => {
        BudgetThresholdStatus.belongsTo(models.Budget, {
            as: 'budget',
            foreignKey: 'budgetId',
            onDelete: 'CASCADE'
        });
    };

    return BudgetThresholdStatus;
};
