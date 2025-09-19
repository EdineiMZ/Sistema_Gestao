'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            const tableDefinition = await queryInterface.describeTable('Users', { transaction });

            if (!tableDefinition.twoFactorEnabled) {
                await queryInterface.addColumn('Users', 'twoFactorEnabled', {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false
                }, { transaction });
            }

            if (!tableDefinition.twoFactorCodeHash) {
                await queryInterface.addColumn('Users', 'twoFactorCodeHash', {
                    type: Sequelize.STRING(128),
                    allowNull: true
                }, { transaction });
            }
        });
    },

    async down(queryInterface) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            const tableDefinition = await queryInterface.describeTable('Users', { transaction });

            if (tableDefinition.twoFactorCodeHash) {
                await queryInterface.removeColumn('Users', 'twoFactorCodeHash', { transaction });
            }

            if (tableDefinition.twoFactorEnabled) {
                await queryInterface.removeColumn('Users', 'twoFactorEnabled', { transaction });
            }
        });
    }
};
