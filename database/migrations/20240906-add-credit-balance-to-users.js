'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const tableDefinition = await queryInterface.describeTable('Users', { transaction });

      if (!tableDefinition.creditBalance) {
        await queryInterface.addColumn(
          'Users',
          'creditBalance',
          {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.0,
          },
          { transaction }
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const tableDefinition = await queryInterface.describeTable('Users', { transaction });

      if (tableDefinition.creditBalance) {
        await queryInterface.removeColumn('Users', 'creditBalance', { transaction });
      }
    });
  },
};
