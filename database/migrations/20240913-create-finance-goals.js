'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('FinanceGoals', {
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
    },

    async down(queryInterface) {
        await queryInterface.dropTable('FinanceGoals');
    }
};
