'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('Promotions', {
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
            description: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            type: {
                type: Sequelize.ENUM('brand', 'category', 'product', 'store'),
                allowNull: false
            },
            discountType: {
                type: Sequelize.ENUM('percentage', 'fixed'),
                allowNull: false
            },
            discountValue: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: false
            },
            targetBrand: {
                type: Sequelize.STRING(150),
                allowNull: true
            },
            targetCategory: {
                type: Sequelize.STRING(150),
                allowNull: true
            },
            targetProductId: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'Products',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            },
            startDate: {
                type: Sequelize.DATE,
                allowNull: true
            },
            endDate: {
                type: Sequelize.DATE,
                allowNull: true
            },
            isActive: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true
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

        await queryInterface.addIndex('Promotions', ['type']);
        await queryInterface.addIndex('Promotions', ['isActive']);
        await queryInterface.addIndex('Promotions', ['targetProductId']);
        await queryInterface.addIndex('Promotions', ['startDate']);
        await queryInterface.addIndex('Promotions', ['endDate']);
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeIndex('Promotions', ['endDate']);
        await queryInterface.removeIndex('Promotions', ['startDate']);
        await queryInterface.removeIndex('Promotions', ['targetProductId']);
        await queryInterface.removeIndex('Promotions', ['isActive']);
        await queryInterface.removeIndex('Promotions', ['type']);
        await queryInterface.dropTable('Promotions');

        if (queryInterface.sequelize && typeof queryInterface.sequelize.query === 'function') {
            const dropQueries = [
                'DROP TYPE IF EXISTS "enum_Promotions_type";',
                'DROP TYPE IF EXISTS "enum_Promotions_discountType";'
            ];

            for (const statement of dropQueries) {
                await queryInterface.sequelize.query(statement).catch(() => {});
            }
        }
    }
};
