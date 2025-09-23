'use strict';

const { randomUUID } = require('crypto');

const SALE_STATUSES = ['open', 'pending_payment', 'completed', 'cancelled'];

const generateAccessKey = () => {
    const uuid = randomUUID().replace(/-/g, '').slice(0, 32).toUpperCase();
    const timestamp = Date.now().toString(16).toUpperCase();
    return `${uuid}${timestamp}`.slice(0, 44);
};

module.exports = (sequelize, DataTypes) => {
    const Sale = sequelize.define('Sale', {
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            validate: {
                min: {
                    args: [1],
                    msg: 'Operador inválido para a venda.'
                }
            }
        },
        status: {
            type: DataTypes.ENUM({ values: SALE_STATUSES, name: 'enum_Sales_status' }),
            allowNull: false,
            defaultValue: 'open',
            validate: {
                isIn: {
                    args: [SALE_STATUSES],
                    msg: 'Status de venda inválido.'
                }
            }
        },
        totalGross: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
            defaultValue: '0.00'
        },
        totalDiscount: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
            defaultValue: '0.00'
        },
        totalTax: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
            defaultValue: '0.00'
        },
        totalNet: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
            defaultValue: '0.00'
        },
        totalPaid: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
            defaultValue: '0.00'
        },
        changeDue: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
            defaultValue: '0.00'
        },
        customerName: {
            type: DataTypes.STRING(160),
            allowNull: true
        },
        customerTaxId: {
            type: DataTypes.STRING(32),
            allowNull: true
        },
        customerEmail: {
            type: DataTypes.STRING(160),
            allowNull: true,
            validate: {
                isEmailOrEmpty(value) {
                    if (!value) {
                        return;
                    }

                    const normalized = String(value).trim();
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
                        throw new Error('E-mail do cliente inválido.');
                    }
                }
            }
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        receiptNumber: {
            type: DataTypes.STRING(48),
            allowNull: true
        },
        accessKey: {
            type: DataTypes.STRING(64),
            allowNull: false,
            defaultValue: generateAccessKey
        },
        qrCodeData: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        openedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        closedAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: true
        }
    }, {
        tableName: 'Sales',
        indexes: [
            { fields: ['status'] },
            { fields: ['openedAt'] },
            { fields: ['userId'] },
            { fields: ['accessKey'], unique: true }
        ]
    });

    Sale.SALE_STATUSES = SALE_STATUSES;

    Sale.associate = (models) => {
        if (models.User) {
            Sale.belongsTo(models.User, {
                as: 'operator',
                foreignKey: 'userId',
                onDelete: 'RESTRICT'
            });

            const hasSaleAssociation = Boolean(models.User.associations && models.User.associations.sales);
            if (!hasSaleAssociation) {
                models.User.hasMany(Sale, {
                    as: 'sales',
                    foreignKey: 'userId'
                });
            }
        }

        if (models.SaleItem) {
            Sale.hasMany(models.SaleItem, {
                as: 'items',
                foreignKey: 'saleId',
                onDelete: 'CASCADE',
                hooks: true
            });
        }

        if (models.SalePayment) {
            Sale.hasMany(models.SalePayment, {
                as: 'payments',
                foreignKey: 'saleId',
                onDelete: 'CASCADE',
                hooks: true
            });
        }
    };

    return Sale;
};
