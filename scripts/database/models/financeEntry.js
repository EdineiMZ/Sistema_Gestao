'use strict';

const {
    FINANCE_RECURRING_INTERVAL_VALUES
} = require('../../src/constants/financeRecurringIntervals');

const allowedRecurringIntervals = new Set(FINANCE_RECURRING_INTERVAL_VALUES);

module.exports = (sequelize, DataTypes) => {
    const FinanceEntry = sequelize.define('FinanceEntry', {
        description: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Descrição é obrigatória.'
                }
            }
        },
        type: { // 'payable' ou 'receivable'
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                isIn: {
                    args: [['payable', 'receivable']],
                    msg: 'Tipo financeiro inválido.'
                }
            }
        },
        value: {
            type: DataTypes.DECIMAL(10,2),
            allowNull: false,
            validate: {
                min: {
                    args: [0],
                    msg: 'Valor precisa ser positivo.'
                }
            }
        },
        dueDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            validate: {
                isDate: {
                    msg: 'Data de vencimento inválida.'
                }
            }
        },
        paymentDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
            validate: {
                isDate: {
                    msg: 'Data de pagamento inválida.'
                }
            }
        },
        financeCategoryId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'FinanceCategories',
                key: 'id'
            },
            onDelete: 'SET NULL',
            validate: {
                isInt: {
                    msg: 'Categoria financeira inválida.'
                }
            }
        },
        status: {
            type: DataTypes.STRING, // 'pending', 'paid', 'overdue'
            defaultValue: 'pending',
            validate: {
                isIn: {
                    args: [['pending', 'paid', 'overdue', 'cancelled']],
                    msg: 'Status financeiro inválido.'
                }
            }
        },
        // Campos extras para automação
        recurring: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        recurringInterval: {
            type: DataTypes.STRING, // 'monthly', 'weekly', etc.
            allowNull: true,
            validate: {
                isAllowedInterval(value) {
                    if (!value) return;

                    const normalizedValue = typeof value === 'string' ? value.toLowerCase() : value;
                    if (!allowedRecurringIntervals.has(normalizedValue)) {
                        throw new Error('Intervalo recorrente inválido.');
                    }
                }
            }
        }
    }, {
        tableName: 'FinanceEntries'
    });

    FinanceEntry.associate = (models) => {
        FinanceEntry.hasMany(models.FinanceAttachment, {
            as: 'attachments',
            foreignKey: 'financeEntryId',
            onDelete: 'CASCADE',
            hooks: true
        });

        if (models.FinanceCategory) {
            FinanceEntry.belongsTo(models.FinanceCategory, {
                as: 'category',
                foreignKey: 'financeCategoryId'
            });
        }
    };

    return FinanceEntry;
};
