'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tableName = 'BudgetThresholdLogs';
        let tableExists = await queryInterface
            .describeTable(tableName)
            .then(() => true)
            .catch(() => false);

        if (!tableExists) {
            await queryInterface.createTable(tableName, {
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

            tableExists = true;
        }

        if (tableExists) {
            const indexes = await queryInterface.showIndex(tableName);
            const hasIndex = (name, fields) =>
                indexes.some((index) => {
                    if (index.name === name) {
                        return true;
                    }

                    if (!index.fields) {
                        return false;
                    }

                    const indexFields = index.fields.map((field) =>
                        field.attribute || field.name || field.columnName || field.column || field.field || field
                    );

                    return (
                        indexFields.length === fields.length &&
                        fields.every((fieldName, position) => indexFields[position] === fieldName)
                    );
                });

            if (!hasIndex('budget_threshold_logs_unique', ['budgetId', 'referenceMonth', 'threshold'])) {
                await queryInterface.addIndex(tableName, {
                    name: 'budget_threshold_logs_unique',
                    unique: true,
                    fields: ['budgetId', 'referenceMonth', 'threshold']
                });
            }

            if (!hasIndex('budget_threshold_logs_budget_idx', ['budgetId'])) {
                await queryInterface.addIndex(tableName, {
                    name: 'budget_threshold_logs_budget_idx',
                    fields: ['budgetId']
                });
            }
        }
    },

    down: async (queryInterface) => {
        const tableName = 'BudgetThresholdLogs';
        const tableExists = await queryInterface
            .describeTable(tableName)
            .then(() => true)
            .catch(() => false);

        if (!tableExists) {
            return;
        }

        const indexes = await queryInterface.showIndex(tableName);

        if (indexes.some((index) => index.name === 'budget_threshold_logs_budget_idx')) {
            await queryInterface.removeIndex(tableName, 'budget_threshold_logs_budget_idx');
        }

        if (indexes.some((index) => index.name === 'budget_threshold_logs_unique')) {
            await queryInterface.removeIndex(tableName, 'budget_threshold_logs_unique');
        }

        await queryInterface.dropTable(tableName);
    }
};
