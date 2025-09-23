'use strict';

module.exports = (sequelize, DataTypes) => {
    const ProductVariation = sequelize.define('ProductVariation', {
        productId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        name: {
            type: DataTypes.STRING(120),
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Nome da variação é obrigatório.'
                }
            }
        },
        sku: {
            type: DataTypes.STRING(80),
            allowNull: true,
            validate: {
                len: {
                    args: [0, 80],
                    msg: 'SKU da variação deve ter até 80 caracteres.'
                }
            }
        },
        barcode: {
            type: DataTypes.STRING(80),
            allowNull: true
        },
        price: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Preço da variação deve ser positivo.'
                }
            }
        },
        costPrice: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Preço de custo da variação deve ser positivo.'
                }
            }
        },
        stockQuantity: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: {
                    args: [0],
                    msg: 'Estoque da variação deve ser positivo.'
                }
            }
        },
        attributes: {
            type: DataTypes.JSON,
            allowNull: true
        },
        weight: {
            type: DataTypes.DECIMAL(10, 3),
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Peso da variação deve ser positivo.'
                }
            }
        }
    }, {
        tableName: 'ProductVariations'
    });

    ProductVariation.associate = (models) => {
        ProductVariation.belongsTo(models.Product, {
            as: 'product',
            foreignKey: 'productId',
            onDelete: 'CASCADE'
        });
    };

    ProductVariation.prototype.toSafeJSON = function toSafeJSON() {
        const raw = this.get({ plain: true });
        return {
            ...raw,
            price: raw.price !== null ? Number(raw.price) : null,
            costPrice: raw.costPrice !== null ? Number(raw.costPrice) : null,
            stockQuantity: raw.stockQuantity !== null ? Number(raw.stockQuantity) : null,
            weight: raw.weight !== null ? Number(raw.weight) : null
        };
    };

    return ProductVariation;
};
