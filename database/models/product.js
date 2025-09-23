'use strict';

module.exports = (sequelize, DataTypes) => {
    const Product = sequelize.define('Product', {
        name: {
            type: DataTypes.STRING(160),
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Nome do produto é obrigatório.'
                },
                len: {
                    args: [2, 160],
                    msg: 'Nome do produto deve ter entre 2 e 160 caracteres.'
                }
            }
        },
        sku: {
            type: DataTypes.STRING(40),
            allowNull: false,
            unique: true,
            validate: {
                notEmpty: {
                    msg: 'SKU é obrigatório.'
                },
                len: {
                    args: [2, 40],
                    msg: 'SKU deve ter entre 2 e 40 caracteres.'
                }
            }
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        unit: {
            type: DataTypes.STRING(12),
            allowNull: false,
            defaultValue: 'un',
            validate: {
                len: {
                    args: [1, 12],
                    msg: 'Unidade deve ter até 12 caracteres.'
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
        taxRate: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
            defaultValue: '0.00',
            validate: {
                min: {
                    args: [0],
                    msg: 'Alíquota não pode ser negativa.'
                }
            }
        },
        taxCode: {
            type: DataTypes.STRING(20),
            allowNull: true,
            validate: {
                len: {
                    args: [1, 20],
                    msg: 'Código fiscal deve ter até 20 caracteres.'
                }
            }
        },
        active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: true
        }
    }, {
        tableName: 'Products',
        indexes: [
            { fields: ['sku'], unique: true },
            { fields: ['name'] },
            { fields: ['active'] }
        ]
    });

    Product.associate = (models) => {
        if (models.SaleItem) {
            Product.hasMany(models.SaleItem, {
                as: 'saleItems',
                foreignKey: 'productId',
                onDelete: 'RESTRICT'
            });
        }
    };

    return Product;
};
