'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        const tableName = 'FinanceGoals';
        const tableExists = await queryInterface
            .describeTable(tableName)
            .then(() => true)
            .catch(() => false);

        if (!tableExists) {
            await queryInterface.createTable(tableName, {
                id: {
                    allowNull: false,
                    autoIncrement: true,
                    primaryKey: true,
                    type: Sequelize.INTEGER
                },
                month: {
                    allowNull: false,
                    type: Sequelize.DATEONLY,
                    unique: true
                },
                targetNetAmount: {
                    allowNull: false,
                    type: Sequelize.DECIMAL(12, 2),
                    defaultValue: 0
                },
                notes: {
                    allowNull: true,
                    type: Sequelize.STRING(255)
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
        }
    },

    async down(queryInterface) {
        const tableName = 'FinanceGoals';
        const tableExists = await queryInterface
            .describeTable(tableName)
            .then(() => true)
            .catch(() => false);

        if (tableExists) {
            await queryInterface.dropTable(tableName);
        }
    }
};
