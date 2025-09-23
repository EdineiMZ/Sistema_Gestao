'use strict';

const PRODUCT_STATUS = ['draft', 'active', 'inactive', 'archived'];
const PRODUCT_VISIBILITY = ['public', 'private', 'restricted'];
const PRODUCT_DISCOUNT_TYPES = ['none', 'percentage', 'fixed'];
const PRODUCT_STOCK_STATUS = ['in-stock', 'out-of-stock', 'preorder', 'backorder'];

module.exports = (sequelize, DataTypes) => {
    const Product = sequelize.define('Product', {
        name: {
            type: DataTypes.STRING(180),
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Nome do produto é obrigatório.'
                },
                len: {
                    args: [3, 180],
                    msg: 'Nome do produto deve ter entre 3 e 180 caracteres.'
                }
            }
        },
        slug: {
            type: DataTypes.STRING(200),
            unique: {
                msg: 'O slug informado já está em uso.'
            },
            validate: {
                len: {
                    args: [0, 200],
                    msg: 'Slug deve ter até 200 caracteres.'
                }
            }
        },
        sku: {
            type: DataTypes.STRING(80),
            unique: {
                msg: 'O SKU informado já está cadastrado.'
            },
            validate: {
                len: {
                    args: [0, 80],
                    msg: 'SKU deve ter até 80 caracteres.'
                }
            }
        },
        barcode: {
            type: DataTypes.STRING(80),
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM(...PRODUCT_STATUS),
            allowNull: false,
            defaultValue: 'draft',
            validate: {
                isIn: {
                    args: [PRODUCT_STATUS],
                    msg: 'Status do produto inválido.'
                }
            }
        },
        visibility: {
            type: DataTypes.ENUM(...PRODUCT_VISIBILITY),
            allowNull: false,
            defaultValue: 'public',
            validate: {
                isIn: {
                    args: [PRODUCT_VISIBILITY],
                    msg: 'Visibilidade inválida.'
                }
            }
        },
        type: {
            type: DataTypes.STRING(40),
            allowNull: true
        },
        brand: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        shortDescription: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        costPrice: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Preço de custo deve ser positivo.'
                }
            }
        },
        price: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Preço deve ser positivo.'
                }
            }
        },
        compareAtPrice: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Preço de comparação deve ser positivo.'
                }
            }
        },
        currency: {
            type: DataTypes.STRING(10),
            allowNull: true,
            defaultValue: 'BRL',
            validate: {
                len: {
                    args: [0, 10],
                    msg: 'Código de moeda inválido.'
                }
            }
        },
        taxIncluded: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        discountType: {
            type: DataTypes.ENUM(...PRODUCT_DISCOUNT_TYPES),
            allowNull: false,
            defaultValue: 'none',
            validate: {
                isIn: {
                    args: [PRODUCT_DISCOUNT_TYPES],
                    msg: 'Tipo de desconto inválido.'
                }
            }
        },
        discountValue: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Valor de desconto deve ser positivo.'
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
                    msg: 'Quantidade em estoque deve ser positiva.'
                }
            }
        },
        stockStatus: {
            type: DataTypes.ENUM(...PRODUCT_STOCK_STATUS),
            allowNull: false,
            defaultValue: 'in-stock',
            validate: {
                isIn: {
                    args: [PRODUCT_STOCK_STATUS],
                    msg: 'Status de estoque inválido.'
                }
            }
        },
        allowBackorder: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        lowStockThreshold: {
            type: DataTypes.INTEGER,
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Estoque mínimo deve ser positivo.'
                }
            }
        },
        maxStockThreshold: {
            type: DataTypes.INTEGER,
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Estoque máximo deve ser positivo.'
                }
            }
        },
        ncmCode: {
            type: DataTypes.STRING(20),
            allowNull: true
        },
        cestCode: {
            type: DataTypes.STRING(20),
            allowNull: true
        },
        taxClass: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        taxRate: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Alíquota fiscal deve ser positiva.'
                }
            }
        },
        fiscalBenefitCode: {
            type: DataTypes.STRING(30),
            allowNull: true
        },
        origin: {
            type: DataTypes.STRING(60),
            allowNull: true
        },
        weight: {
            type: DataTypes.DECIMAL(10, 3),
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Peso deve ser positivo.'
                }
            }
        },
        height: {
            type: DataTypes.DECIMAL(10, 3),
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Altura deve ser positiva.'
                }
            }
        },
        width: {
            type: DataTypes.DECIMAL(10, 3),
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Largura deve ser positiva.'
                }
            }
        },
        length: {
            type: DataTypes.DECIMAL(10, 3),
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Comprimento deve ser positivo.'
                }
            }
        },
        weightUnit: {
            type: DataTypes.STRING(10),
            allowNull: true,
            defaultValue: 'kg'
        },
        dimensionsUnit: {
            type: DataTypes.STRING(10),
            allowNull: true,
            defaultValue: 'cm'
        },
        requiresShipping: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        shippingClass: {
            type: DataTypes.STRING(80),
            allowNull: true
        },
        deliveryTimeMin: {
            type: DataTypes.INTEGER,
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Prazo mínimo deve ser positivo.'
                }
            }
        },
        deliveryTimeMax: {
            type: DataTypes.INTEGER,
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Prazo máximo deve ser positivo.'
                }
            }
        },
        seoTitle: {
            type: DataTypes.STRING(180),
            allowNull: true
        },
        seoDescription: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        seoKeywords: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        tags: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        isFeatured: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        releaseDate: {
            type: DataTypes.DATE,
            allowNull: true
        },
        canonicalUrl: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        metaImageUrl: {
            type: DataTypes.STRING(255),
            allowNull: true
        }
    }, {
        tableName: 'Products'
    });

    Product.associate = (models) => {
        Product.hasMany(models.ProductVariation, {
            as: 'variations',
            foreignKey: 'productId',
            onDelete: 'CASCADE',
            hooks: true
        });
        Product.hasMany(models.ProductMedia, {
            as: 'media',
            foreignKey: 'productId',
            onDelete: 'CASCADE',
            hooks: true
        });
        Product.hasMany(models.ProductSupplier, {
            as: 'suppliers',
            foreignKey: 'productId',
            onDelete: 'CASCADE',
            hooks: true
        });
    };

    Product.prototype.toSafeJSON = function toSafeJSON() {
        const raw = this.get({ plain: true });
        return {
            ...raw,
            costPrice: raw.costPrice !== null ? Number(raw.costPrice) : null,
            price: raw.price !== null ? Number(raw.price) : null,
            compareAtPrice: raw.compareAtPrice !== null ? Number(raw.compareAtPrice) : null,
            discountValue: raw.discountValue !== null ? Number(raw.discountValue) : null,
            stockQuantity: raw.stockQuantity !== null ? Number(raw.stockQuantity) : null,
            lowStockThreshold: raw.lowStockThreshold !== null ? Number(raw.lowStockThreshold) : null,
            maxStockThreshold: raw.maxStockThreshold !== null ? Number(raw.maxStockThreshold) : null,
            taxRate: raw.taxRate !== null ? Number(raw.taxRate) : null,
            weight: raw.weight !== null ? Number(raw.weight) : null,
            height: raw.height !== null ? Number(raw.height) : null,
            width: raw.width !== null ? Number(raw.width) : null,
            length: raw.length !== null ? Number(raw.length) : null,
            deliveryTimeMin: raw.deliveryTimeMin !== null ? Number(raw.deliveryTimeMin) : null,
            deliveryTimeMax: raw.deliveryTimeMax !== null ? Number(raw.deliveryTimeMax) : null
        };
    };

    return Product;
};

module.exports.PRODUCT_STATUS = PRODUCT_STATUS;
module.exports.PRODUCT_VISIBILITY = PRODUCT_VISIBILITY;
module.exports.PRODUCT_DISCOUNT_TYPES = PRODUCT_DISCOUNT_TYPES;
module.exports.PRODUCT_STOCK_STATUS = PRODUCT_STOCK_STATUS;
