'use strict';

const TABLE_NAME = 'FinanceAccessPolicies';
const POLICY_KEY = 'finance_access';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tableDefinition = await queryInterface.describeTable(TABLE_NAME).catch(() => null);

        if (!tableDefinition) {
            await queryInterface.createTable(TABLE_NAME, {
                id: {
                    allowNull: false,
                    autoIncrement: true,
                    primaryKey: true,
                    type: Sequelize.INTEGER
                },
                policyKey: {
                    type: Sequelize.STRING(100),
                    allowNull: false,
                    defaultValue: POLICY_KEY
                },
                allowedRoles: {
                    type: Sequelize.TEXT,
                    allowNull: false,
                    defaultValue: '[]'
                },
                updatedById: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: {
                        model: 'Users',
                        key: 'id'
                    },
                    onUpdate: 'SET NULL',
                    onDelete: 'SET NULL'
                },
                updatedByName: {
                    type: Sequelize.STRING(255),
                    allowNull: true
                },
                createdAt: {
                    allowNull: false,
                    type: Sequelize.DATE,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                },
                updatedAt: {
                    allowNull: false,
                    type: Sequelize.DATE,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                }
            });
        }

        const existingIndexes = await queryInterface.showIndex(TABLE_NAME).catch(() => []);
        const indexNames = new Set(existingIndexes.map((index) => index.name));
        const policyIndexName = 'finance_access_policy_key_idx';

        if (!indexNames.has(policyIndexName)) {
            await queryInterface.addIndex(TABLE_NAME, {
                name: policyIndexName,
                unique: true,
                fields: ['policyKey']
            });
        }
    },

    down: async (queryInterface) => {
        const tableDefinition = await queryInterface.describeTable(TABLE_NAME).catch(() => null);
        if (tableDefinition) {
            await queryInterface.dropTable(TABLE_NAME);
        }
    }
};
