'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tableName = 'Budgets';
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

            if (!hasIndex('budgets_user_category_unique', ['userId', 'financeCategoryId'])) {
                await queryInterface.addIndex(tableName, {
                    name: 'budgets_user_category_unique',
                    unique: true,
                    fields: ['userId', 'financeCategoryId']
                });
            }

            if (!hasIndex('budgets_category_idx', ['financeCategoryId'])) {
                await queryInterface.addIndex(tableName, {
                    name: 'budgets_category_idx',
                    fields: ['financeCategoryId']
                });
            }
        }
    },

    down: async (queryInterface) => {
        const tableName = 'Budgets';
        const tableExists = await queryInterface
            .describeTable(tableName)
            .then(() => true)
            .catch(() => false);

        if (!tableExists) {
            return;
        }

        const indexes = await queryInterface.showIndex(tableName);

        if (indexes.some((index) => index.name === 'budgets_category_idx')) {
            await queryInterface.removeIndex(tableName, 'budgets_category_idx');
        }

        if (indexes.some((index) => index.name === 'budgets_user_category_unique')) {
            await queryInterface.removeIndex(tableName, 'budgets_user_category_unique');
        }

        await queryInterface.dropTable(tableName);
    }
};
