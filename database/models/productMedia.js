'use strict';

const MEDIA_TYPES = ['image', 'video', 'document'];

module.exports = (sequelize, DataTypes) => {
    const ProductMedia = sequelize.define('ProductMedia', {
        productId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        type: {
            type: DataTypes.ENUM(...MEDIA_TYPES),
            allowNull: false,
            defaultValue: 'image',
            validate: {
                isIn: {
                    args: [MEDIA_TYPES],
                    msg: 'Tipo de mídia inválido.'
                }
            }
        },
        url: {
            type: DataTypes.STRING(255),
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'URL da mídia é obrigatória.'
                }
            }
        },
        altText: {
            type: DataTypes.STRING(180),
            allowNull: true
        },
        position: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        isPrimary: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: true
        }
    }, {
        tableName: 'ProductMedia'
    });

    ProductMedia.associate = (models) => {
        ProductMedia.belongsTo(models.Product, {
            as: 'product',
            foreignKey: 'productId',
            onDelete: 'CASCADE'
        });
    };

    return ProductMedia;
};

module.exports.MEDIA_TYPES = MEDIA_TYPES;
