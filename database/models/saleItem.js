'use strict';

module.exports = (sequelize, DataTypes) => {
    const SaleItem = sequelize.define('SaleItem', {
        saleId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            validate: {
                min: {
                    args: [1],
                    msg: 'Venda inválida para o item.'
                }
            }
        },
        productId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            validate: {
                min: {
                    args: [1],
                    msg: 'Produto inválido para o item.'
                }
            }
        },
        productName: {
            type: DataTypes.STRING(160),
            allowNull: false
        },
        sku: {
            type: DataTypes.STRING(40),
            allowNull: true
        },
        unitLabel: {
            type: DataTypes.STRING(12),
            allowNull: false,
            defaultValue: 'un'
        },
        quantity: {
            type: DataTypes.DECIMAL(10, 3),
            allowNull: false,
            defaultValue: '1.000',
            validate: {
                min: {
                    args: [0.001],
                    msg: 'Quantidade deve ser maior que zero.'
                }
            }
        },
        unitPrice: {
            type: DataTypes.DECIMAL(12, 4),
            allowNull: false,
            defaultValue: '0.0000',
            validate: {
                min: {
                    args: [0],
                    msg: 'Preço unitário não pode ser negativo.'
                }
            }
        },
        grossTotal: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
            defaultValue: '0.00'
        },
        discountValue: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
            defaultValue: '0.00'
        },
        taxValue: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
            defaultValue: '0.00'
        },
        netTotal: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
            defaultValue: '0.00'
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: true
        }
    }, {
        tableName: 'SaleItems',
        indexes: [
            { fields: ['saleId'] },
            { fields: ['productId'] }
        ]
    });

    SaleItem.associate = (models) => {
        if (models.Sale) {
            SaleItem.belongsTo(models.Sale, {
                as: 'sale',
                foreignKey: 'saleId',
                onDelete: 'CASCADE'
            });
        }

        if (models.Product) {
            SaleItem.belongsTo(models.Product, {
                as: 'product',
                foreignKey: 'productId',
                onDelete: 'RESTRICT'
            });
        }
    };

    return SaleItem;
};
