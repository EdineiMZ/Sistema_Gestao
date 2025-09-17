'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('FinanceCategories', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            name: {
                type: Sequelize.STRING(120),
                allowNull: false
            },
            slug: {
                type: Sequelize.STRING(120),
                allowNull: false
            },
            color: {
                type: Sequelize.STRING(9),
                allowNull: false,
                defaultValue: '#6c757d'
            },
            isActive: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true
            },
            ownerId: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'Users',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            },
            createdAt: {
                type: Sequelize.DATE,
                allowNull: false
            },
            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false
            }
        });

        await queryInterface.addIndex('FinanceCategories', {
            name: 'finance_categories_owner_slug_unique',
            unique: true,
            fields: ['ownerId', 'slug']
        });

        await queryInterface.addIndex('FinanceCategories', {
            name: 'finance_categories_owner_idx',
            fields: ['ownerId']
        });
    },

    down: async (queryInterface) => {
        await queryInterface.removeIndex('FinanceCategories', 'finance_categories_owner_idx');
        await queryInterface.removeIndex('FinanceCategories', 'finance_categories_owner_slug_unique');
        await queryInterface.dropTable('FinanceCategories');
    }
};
