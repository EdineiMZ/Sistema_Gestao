'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const tableDefinition = await queryInterface.describeTable('Notifications', { transaction });

      if (!tableDefinition.messageHtml) {
        await queryInterface.addColumn(
          'Notifications',
          'messageHtml',
          {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          { transaction }
        );
      }
    });
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const tableDefinition = await queryInterface.describeTable('Notifications', { transaction });

      if (tableDefinition.messageHtml) {
        await queryInterface.removeColumn('Notifications', 'messageHtml', { transaction });
      }
    });
  },
};
