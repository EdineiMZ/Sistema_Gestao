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
    }

    if (!(reference instanceof Date) || Number.isNaN(reference.getTime())) {
        return null;
    }

    const normalized = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
    return normalized.toISOString().slice(0, 10);
};

module.exports = (sequelize, DataTypes) => {
    const FinanceGoal = sequelize.define('FinanceGoal', {
        month: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            unique: true,
            validate: {
                isDate: {
                    msg: 'Período da meta inválido.'
                }
            }
        },
        targetNetAmount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0,
            validate: {
                isDecimal: {
                    msg: 'Valor da meta deve ser numérico.'
                }
            }
        },
        notes: {
            type: DataTypes.STRING(255),
            allowNull: true
        }
    }, {
        tableName: 'FinanceGoals',
        indexes: [
            {
                unique: true,
                fields: ['month']
            }
        ]
    });

    FinanceGoal.addHook('beforeValidate', (goal) => {
        if (!goal) {
            return;
        }

        const normalizedMonth = normalizeMonthValue(goal.month);
        if (normalizedMonth) {
            goal.month = normalizedMonth;
        }
    });

    FinanceGoal.normalizeMonthValue = normalizeMonthValue;

    return FinanceGoal;
};
