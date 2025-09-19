'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tableName = 'FinanceCategories';
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

            if (!hasIndex('finance_categories_owner_slug_unique', ['ownerId', 'slug'])) {
                await queryInterface.addIndex(tableName, {
                    name: 'finance_categories_owner_slug_unique',
                    unique: true,
                    fields: ['ownerId', 'slug']
                });
            }

            if (!hasIndex('finance_categories_owner_idx', ['ownerId'])) {
                await queryInterface.addIndex(tableName, {
                    name: 'finance_categories_owner_idx',
                    fields: ['ownerId']
                });
            }
        }
    },

    down: async (queryInterface) => {
        const tableName = 'FinanceCategories';
        const tableExists = await queryInterface
            .describeTable(tableName)
            .then(() => true)
            .catch(() => false);

        if (!tableExists) {
            return;
        }

        const indexes = await queryInterface.showIndex(tableName);

        if (indexes.some((index) => index.name === 'finance_categories_owner_idx')) {
            await queryInterface.removeIndex(tableName, 'finance_categories_owner_idx');
        }

        if (indexes.some((index) => index.name === 'finance_categories_owner_slug_unique')) {
            await queryInterface.removeIndex(tableName, 'finance_categories_owner_slug_unique');
        }

        await queryInterface.dropTable(tableName);
    }
};
