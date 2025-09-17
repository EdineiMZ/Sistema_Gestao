'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('BudgetThresholdStatuses', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            budgetId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Budgets',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            threshold: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: false
            },
            referenceMonth: {
                type: Sequelize.DATEONLY,
                allowNull: false
            },
            triggeredAt: {
                type: Sequelize.DATE,
                allowNull: false
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

        await queryInterface.addIndex('BudgetThresholdStatuses', {
            name: 'budget_threshold_statuses_unique_idx',
            unique: true,
            fields: ['budgetId', 'referenceMonth', 'threshold']
        });

        await queryInterface.addIndex('BudgetThresholdStatuses', {
            name: 'budget_threshold_statuses_budget_idx',
            fields: ['budgetId']
        });
    },

    down: async (queryInterface) => {
        await queryInterface.removeIndex('BudgetThresholdStatuses', 'budget_threshold_statuses_budget_idx');
        await queryInterface.removeIndex('BudgetThresholdStatuses', 'budget_threshold_statuses_unique_idx');
        await queryInterface.dropTable('BudgetThresholdStatuses');
    }
};
