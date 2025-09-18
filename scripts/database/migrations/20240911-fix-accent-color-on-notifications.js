'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            const tableDefinition = await queryInterface.describeTable('Notifications', { transaction });

            if (tableDefinition.accentColor) {
                await queryInterface.removeColumn('Notifications', 'accentColor', { transaction });
            }

            await queryInterface.addColumn(
                'Notifications',
                'accentColor',
                {
                    type: Sequelize.STRING(9),
                    allowNull: false,
                    defaultValue: '#0d6efd'
                },
                { transaction }
            );
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            const tableDefinition = await queryInterface.describeTable('Notifications', { transaction });

            if (tableDefinition.accentColor) {
                await queryInterface.removeColumn('Notifications', 'accentColor', { transaction });
            }

            await queryInterface.addColumn(
                'Notifications',
                'accentColor',
                {
                    type: Sequelize.DATE,
                    allowNull: true
                },
                { transaction }
            );
        });
    }
};
