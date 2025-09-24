'use strict';

const PROMOTION_TYPES = ['brand', 'category', 'product', 'store'];
const PROMOTION_DISCOUNT_TYPES = ['percentage', 'fixed'];

module.exports = (sequelize, DataTypes) => {
    const Promotion = sequelize.define('Promotion', {
        name: {
            type: DataTypes.STRING(180),
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Nome da promoção é obrigatório.'
                },
                len: {
                    args: [3, 180],
                    msg: 'Nome deve ter entre 3 e 180 caracteres.'
                }
            }
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        type: {
            type: DataTypes.ENUM(...PROMOTION_TYPES),
            allowNull: false,
            validate: {
                isIn: {
                    args: [PROMOTION_TYPES],
                    msg: 'Tipo de promoção inválido.'
                }
            }
        },
        discountType: {
            type: DataTypes.ENUM(...PROMOTION_DISCOUNT_TYPES),
            allowNull: false,
            validate: {
                isIn: {
                    args: [PROMOTION_DISCOUNT_TYPES],
                    msg: 'Tipo de desconto inválido.'
                }
            }
        },
        discountValue: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            validate: {
                min: {
                    args: [0],
                    msg: 'Valor de desconto deve ser positivo.'
                }
            }
        },
        targetBrand: {
            type: DataTypes.STRING(150),
            allowNull: true
        },
        targetCategory: {
            type: DataTypes.STRING(150),
            allowNull: true
        },
        targetProductId: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        startDate: {
            type: DataTypes.DATE,
            allowNull: true
        },
        endDate: {
            type: DataTypes.DATE,
            allowNull: true
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        }
    }, {
        tableName: 'Promotions'
    });

    Promotion.associate = (models) => {
        Promotion.belongsTo(models.Product, {
            as: 'product',
            foreignKey: 'targetProductId'
        });
    };

    Promotion.prototype.toSafeJSON = function toSafeJSON() {
        const raw = this.get({ plain: true });
        return {
            ...raw,
            discountValue: raw.discountValue !== null ? Number(raw.discountValue) : null,
            startDate: raw.startDate ? new Date(raw.startDate) : null,
            endDate: raw.endDate ? new Date(raw.endDate) : null,
            isActive: Boolean(raw.isActive)
        };
    };

    return Promotion;
};

module.exports.PROMOTION_TYPES = PROMOTION_TYPES;
module.exports.PROMOTION_DISCOUNT_TYPES = PROMOTION_DISCOUNT_TYPES;
