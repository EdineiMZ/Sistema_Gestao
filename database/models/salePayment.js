'use strict';

const PAYMENT_METHODS = ['cash', 'debit', 'credit', 'pix', 'voucher', 'transfer', 'other'];

module.exports = (sequelize, DataTypes) => {
    const SalePayment = sequelize.define('SalePayment', {
        saleId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            validate: {
                min: {
                    args: [1],
                    msg: 'Pagamento deve estar vinculado a uma venda válida.'
                }
            }
        },
        method: {
            type: DataTypes.ENUM({ values: PAYMENT_METHODS, name: 'enum_SalePayments_method' }),
            allowNull: false,
            validate: {
                isIn: {
                    args: [PAYMENT_METHODS],
                    msg: 'Método de pagamento inválido.'
                }
            }
        },
        amount: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
            defaultValue: '0.00',
            validate: {
                min: {
                    args: [0],
                    msg: 'Valor do pagamento não pode ser negativo.'
                }
            }
        },
        paidAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        transactionReference: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: true
        }
    }, {
        tableName: 'SalePayments',
        indexes: [
            { fields: ['saleId'] },
            { fields: ['method'] }
        ]
    });

    SalePayment.PAYMENT_METHODS = PAYMENT_METHODS;

    SalePayment.associate = (models) => {
        if (models.Sale) {
            SalePayment.belongsTo(models.Sale, {
                as: 'sale',
                foreignKey: 'saleId',
                onDelete: 'CASCADE'
            });
        }
    };

    return SalePayment;
};
