'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('Products', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER
            },
            name: {
                type: Sequelize.STRING(180),
                allowNull: false
            },
            slug: {
                type: Sequelize.STRING(200),
                allowNull: true,
                unique: true
            },
            sku: {
                type: Sequelize.STRING(80),
                allowNull: true,
                unique: true
            },
            barcode: {
                type: Sequelize.STRING(80),
                allowNull: true
            },
            status: {
                type: Sequelize.ENUM('draft', 'active', 'inactive', 'archived'),
                allowNull: false,
                defaultValue: 'draft'
            },
            visibility: {
                type: Sequelize.ENUM('public', 'private', 'restricted'),
                allowNull: false,
                defaultValue: 'public'
            },
            type: {
                type: Sequelize.STRING(40),
                allowNull: true
            },
            brand: {
                type: Sequelize.STRING(120),
                allowNull: true
            },
            shortDescription: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            description: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            costPrice: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: true
            },
            price: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: true
            },
            compareAtPrice: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: true
            },
            currency: {
                type: Sequelize.STRING(10),
                allowNull: true,
                defaultValue: 'BRL'
            },
            taxIncluded: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            discountType: {
                type: Sequelize.ENUM('none', 'percentage', 'fixed'),
                allowNull: false,
                defaultValue: 'none'
            },
            discountValue: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: true
            },
            stockQuantity: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            stockStatus: {
                type: Sequelize.ENUM('in-stock', 'out-of-stock', 'preorder', 'backorder'),
                allowNull: false,
                defaultValue: 'in-stock'
            },
            allowBackorder: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            lowStockThreshold: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            maxStockThreshold: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            ncmCode: {
                type: Sequelize.STRING(20),
                allowNull: true
            },
            cestCode: {
                type: Sequelize.STRING(20),
                allowNull: true
            },
            taxClass: {
                type: Sequelize.STRING(120),
                allowNull: true
            },
            taxRate: {
                type: Sequelize.DECIMAL(5, 2),
                allowNull: true
            },
            fiscalBenefitCode: {
                type: Sequelize.STRING(30),
                allowNull: true
            },
            origin: {
                type: Sequelize.STRING(60),
                allowNull: true
            },
            weight: {
                type: Sequelize.DECIMAL(10, 3),
                allowNull: true
            },
            height: {
                type: Sequelize.DECIMAL(10, 3),
                allowNull: true
            },
            width: {
                type: Sequelize.DECIMAL(10, 3),
                allowNull: true
            },
            length: {
                type: Sequelize.DECIMAL(10, 3),
                allowNull: true
            },
            weightUnit: {
                type: Sequelize.STRING(10),
                allowNull: true,
                defaultValue: 'kg'
            },
            dimensionsUnit: {
                type: Sequelize.STRING(10),
                allowNull: true,
                defaultValue: 'cm'
            },
            requiresShipping: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            shippingClass: {
                type: Sequelize.STRING(80),
                allowNull: true
            },
            deliveryTimeMin: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            deliveryTimeMax: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            seoTitle: {
                type: Sequelize.STRING(180),
                allowNull: true
            },
            seoDescription: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            seoKeywords: {
                type: Sequelize.STRING(255),
                allowNull: true
            },
            tags: {
                type: Sequelize.STRING(255),
                allowNull: true
            },
            isFeatured: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            releaseDate: {
                type: Sequelize.DATE,
                allowNull: true
            },
            canonicalUrl: {
                type: Sequelize.STRING(255),
                allowNull: true
            },
            metaImageUrl: {
                type: Sequelize.STRING(255),
                allowNull: true
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.fn('NOW')
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.fn('NOW')
            }
        });

        await queryInterface.createTable('ProductVariations', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER
            },
            productId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Products',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            name: {
                type: Sequelize.STRING(120),
                allowNull: false
            },
            sku: {
                type: Sequelize.STRING(80),
                allowNull: true
            },
            barcode: {
                type: Sequelize.STRING(80),
                allowNull: true
            },
            price: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: true
            },
            costPrice: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: true
            },
            stockQuantity: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            attributes: {
                type: Sequelize.JSON,
                allowNull: true
            },
            weight: {
                type: Sequelize.DECIMAL(10, 3),
                allowNull: true
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.fn('NOW')
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.fn('NOW')
            }
        });

        await queryInterface.createTable('ProductMedia', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER
            },
            productId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Products',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            type: {
                type: Sequelize.ENUM('image', 'video', 'document'),
                allowNull: false,
                defaultValue: 'image'
            },
            url: {
                type: Sequelize.STRING(255),
                allowNull: false
            },
            altText: {
                type: Sequelize.STRING(180),
                allowNull: true
            },
            position: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            isPrimary: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            metadata: {
                type: Sequelize.JSON,
                allowNull: true
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.fn('NOW')
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.fn('NOW')
            }
        });

        await queryInterface.createTable('ProductSuppliers', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER
            },
            productId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Products',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            supplierName: {
                type: Sequelize.STRING(180),
                allowNull: false
            },
            supplierSku: {
                type: Sequelize.STRING(120),
                allowNull: true
            },
            supplierPrice: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: true
            },
            leadTimeDays: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            minimumOrderQuantity: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            contactEmail: {
                type: Sequelize.STRING(180),
                allowNull: true
            },
            contactPhone: {
                type: Sequelize.STRING(60),
                allowNull: true
            },
            isPreferred: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.fn('NOW')
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.fn('NOW')
            }
        });

        await queryInterface.addIndex('Products', ['status']);
        await queryInterface.addIndex('Products', ['visibility']);
        await queryInterface.addIndex('Products', ['slug']);
        await queryInterface.addIndex('Products', ['sku']);
        await queryInterface.addIndex('ProductVariations', ['productId']);
        await queryInterface.addIndex('ProductMedia', ['productId']);
        await queryInterface.addIndex('ProductSuppliers', ['productId']);
    },

    down: async (queryInterface) => {
        await queryInterface.removeIndex('ProductSuppliers', ['productId']);
        await queryInterface.removeIndex('ProductMedia', ['productId']);
        await queryInterface.removeIndex('ProductVariations', ['productId']);
        await queryInterface.removeIndex('Products', ['sku']);
        await queryInterface.removeIndex('Products', ['slug']);
        await queryInterface.removeIndex('Products', ['visibility']);
        await queryInterface.removeIndex('Products', ['status']);
        await queryInterface.dropTable('ProductSuppliers');
        await queryInterface.dropTable('ProductMedia');
        await queryInterface.dropTable('ProductVariations');
        await queryInterface.dropTable('Products');

        const dialect = queryInterface.sequelize.getDialect();
        if (dialect !== 'sqlite') {
            await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_ProductMedia_type"');
            await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Products_status"');
            await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Products_visibility"');
            await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Products_discountType"');
            await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Products_stockStatus"');
        }
    }
};
