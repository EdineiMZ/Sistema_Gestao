'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('BudgetThresholdLogs', {
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
            referenceMonth: {
                type: Sequelize.DATEONLY,
                allowNull: false
            },
            threshold: {
                type: Sequelize.DECIMAL(5, 4),
                allowNull: false
            },
            consumptionValue: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: false
            },
            limitValue: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: false
            },
            triggeredAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
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

        await queryInterface.addIndex('BudgetThresholdLogs', {
            name: 'budget_threshold_logs_unique',
            unique: true,
            fields: ['budgetId', 'referenceMonth', 'threshold']
        });

        await queryInterface.addIndex('BudgetThresholdLogs', {
            name: 'budget_threshold_logs_budget_idx',
            fields: ['budgetId']
        });
    },

    down: async (queryInterface) => {
        await queryInterface.removeIndex('BudgetThresholdLogs', 'budget_threshold_logs_budget_idx');
        await queryInterface.removeIndex('BudgetThresholdLogs', 'budget_threshold_logs_unique');
        await queryInterface.dropTable('BudgetThresholdLogs');
    }
};
