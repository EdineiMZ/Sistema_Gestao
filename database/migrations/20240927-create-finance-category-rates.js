'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tableName = 'FinanceCategoryRates';
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
                    allowNull: true,
                    references: {
                        model: 'Users',
                        key: 'id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE'
                },
                financeCategoryId: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: {
                        model: 'FinanceCategories',
                        key: 'id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'SET NULL'
                },
                ratePeriod: {
                    type: Sequelize.STRING(16),
                    allowNull: false,
                    defaultValue: 'annual'
                },
                simpleRate: {
                    type: Sequelize.DECIMAL(10, 6),
                    allowNull: false,
                    defaultValue: 0
                },
                compoundRate: {
                    type: Sequelize.DECIMAL(10, 6),
                    allowNull: false,
                    defaultValue: 0
                },
                contributionAmount: {
                    type: Sequelize.DECIMAL(12, 2),
                    allowNull: false,
                    defaultValue: 0
                },
                contributionFrequency: {
                    type: Sequelize.STRING(16),
                    allowNull: false,
                    defaultValue: 'monthly'
                },
                periodMonths: {
                    type: Sequelize.INTEGER,
                    allowNull: true
                },
                notes: {
                    type: Sequelize.TEXT,
                    allowNull: true
                },
                createdAt: {
                    allowNull: false,
                    type: Sequelize.DATE
                },
                updatedAt: {
                    allowNull: false,
                    type: Sequelize.DATE
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

            if (!hasIndex('finance_category_rates_user_category_unique', ['userId', 'financeCategoryId'])) {
                await queryInterface.addIndex(tableName, {
                    name: 'finance_category_rates_user_category_unique',
                    unique: true,
                    fields: ['userId', 'financeCategoryId']
                });
            }

            if (!hasIndex('finance_category_rates_category_idx', ['financeCategoryId'])) {
                await queryInterface.addIndex(tableName, {
                    name: 'finance_category_rates_category_idx',
                    fields: ['financeCategoryId']
                });
            }
        }
    },

    down: async (queryInterface) => {
        const tableName = 'FinanceCategoryRates';
        const tableExists = await queryInterface
            .describeTable(tableName)
            .then(() => true)
            .catch(() => false);

        if (!tableExists) {
            return;
        }

        const indexes = await queryInterface.showIndex(tableName);

        if (indexes.some((index) => index.name === 'finance_category_rates_category_idx')) {
            await queryInterface.removeIndex(tableName, 'finance_category_rates_category_idx');
        }

        if (indexes.some((index) => index.name === 'finance_category_rates_user_category_unique')) {
            await queryInterface.removeIndex(tableName, 'finance_category_rates_user_category_unique');
        }

        await queryInterface.dropTable(tableName);
    }
};
