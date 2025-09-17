'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('Budgets', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            userId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            financeCategoryId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'FinanceCategories',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            monthlyLimit: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: false
            },
            thresholds: {
                type: Sequelize.JSON,
                allowNull: false,
                defaultValue: [],
                comment: 'Limiares de alerta normalizados entre 0 e 1 (com duas casas decimais).'
            },
            referenceMonth: {
                type: Sequelize.DATEONLY,
                allowNull: true
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

        await queryInterface.addIndex('Budgets', {
            name: 'budgets_user_category_unique',
            unique: true,
            fields: ['userId', 'financeCategoryId']
        });

        await queryInterface.addIndex('Budgets', {
            name: 'budgets_category_idx',
            fields: ['financeCategoryId']
        });
    },

    down: async (queryInterface) => {
        await queryInterface.removeIndex('Budgets', 'budgets_category_idx');
        await queryInterface.removeIndex('Budgets', 'budgets_user_category_unique');
        await queryInterface.dropTable('Budgets');
    }
};
