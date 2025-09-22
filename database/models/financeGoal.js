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
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            validate: {
                isInt: {
                    msg: 'Usuário da meta inválido.'
                }
            }
        },
        month: {
            type: DataTypes.DATEONLY,
            allowNull: false,
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
                name: 'finance_goals_user_month_unique',
                fields: ['userId', 'month']
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

    FinanceGoal.associate = (models) => {
        if (models.User) {
            FinanceGoal.belongsTo(models.User, {
                as: 'user',
                foreignKey: 'userId'
            });
        }
    };

    return FinanceGoal;
};
