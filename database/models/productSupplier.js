'use strict';

module.exports = (sequelize, DataTypes) => {
    const ProductSupplier = sequelize.define('ProductSupplier', {
        productId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        supplierName: {
            type: DataTypes.STRING(180),
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Nome do fornecedor é obrigatório.'
                }
            }
        },
        supplierSku: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        supplierPrice: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Preço do fornecedor deve ser positivo.'
                }
            }
        },
        leadTimeDays: {
            type: DataTypes.INTEGER,
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Prazo de entrega deve ser positivo.'
                }
            }
        },
        minimumOrderQuantity: {
            type: DataTypes.INTEGER,
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Quantidade mínima deve ser positiva.'
                }
            }
        },
        contactEmail: {
            type: DataTypes.STRING(180),
            allowNull: true,
            validate: {
                isEmail: {
                    msg: 'E-mail do fornecedor inválido.'
                }
            }
        },
        contactPhone: {
            type: DataTypes.STRING(60),
            allowNull: true
        },
        isPreferred: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        }
    }, {
        tableName: 'ProductSuppliers'
    });

    ProductSupplier.associate = (models) => {
        ProductSupplier.belongsTo(models.Product, {
            as: 'product',
            foreignKey: 'productId',
            onDelete: 'CASCADE'
        });
    };

    ProductSupplier.prototype.toSafeJSON = function toSafeJSON() {
        const raw = this.get({ plain: true });
        return {
            ...raw,
            supplierPrice: raw.supplierPrice !== null ? Number(raw.supplierPrice) : null,
            leadTimeDays: raw.leadTimeDays !== null ? Number(raw.leadTimeDays) : null,
            minimumOrderQuantity: raw.minimumOrderQuantity !== null ? Number(raw.minimumOrderQuantity) : null
        };
    };

    return ProductSupplier;
};
