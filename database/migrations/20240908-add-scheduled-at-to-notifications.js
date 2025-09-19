'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const tableDefinition = await queryInterface.describeTable('Notifications', { transaction });

      if (!tableDefinition.scheduledAt) {
        await queryInterface.addColumn(
          'Notifications',
          'scheduledAt',
          {
            type: Sequelize.DATE,
            allowNull: true,
          },
          { transaction }
        );
      }

      const rawDialect = queryInterface.sequelize?.getDialect?.() || queryInterface.sequelize?.dialect?.name;
      const normalizedDialect = typeof rawDialect === 'string' ? rawDialect.toLowerCase() : '';
      if (normalizedDialect === 'postgres' || normalizedDialect === 'postgresql') {
        await queryInterface.sequelize.query(
          `
        UPDATE "Notifications"
        SET "scheduledAt" = "triggerDate"
        WHERE "triggerDate" IS NOT NULL
          AND ("scheduledAt" IS NULL OR "scheduledAt" = "triggerDate");
      `,
          { transaction }
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const tableDefinition = await queryInterface.describeTable('Notifications', { transaction });

      if (tableDefinition.scheduledAt) {
        await queryInterface.removeColumn('Notifications', 'scheduledAt', { transaction });
      }
    });
  },
};
