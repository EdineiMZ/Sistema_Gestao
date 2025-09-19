'use strict';

const STATUS_VALUES = ['draft', 'scheduled', 'queued', 'sending', 'sent', 'failed', 'cancelled'];
const STATUS_DEFAULT = 'draft';
const STATUS_CHECK_CONSTRAINT_NAME = 'notifications_status_check';

const getDialect = (queryInterface) => {
  const rawDialect = queryInterface.sequelize?.getDialect?.()
    || queryInterface.sequelize?.dialect?.name
    || queryInterface.sequelize?.options?.dialect;
  return typeof rawDialect === 'string' ? rawDialect.toLowerCase() : '';
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDefinition = await queryInterface.describeTable('Notifications');

    if (!tableDefinition.status) {
      await queryInterface.addColumn('Notifications', 'status', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: STATUS_DEFAULT,
      });
    }

    const dialect = getDialect(queryInterface);
    if (dialect === 'postgres' || dialect === 'postgresql') {
      const [[constraint]] = await queryInterface.sequelize.query(
        `SELECT conname FROM pg_constraint WHERE conname = :constraintName LIMIT 1;`,
        { replacements: { constraintName: STATUS_CHECK_CONSTRAINT_NAME } },
      );

      if (!constraint) {
        const allowedStatuses = STATUS_VALUES.map((status) => `'${status}'`).join(', ');
        await queryInterface.sequelize.query(`
          ALTER TABLE "Notifications"
          ADD CONSTRAINT "${STATUS_CHECK_CONSTRAINT_NAME}"
          CHECK ("status" IN (${allowedStatuses}));
        `);
      }
    }

    if (!tableDefinition.previewText) {
      await queryInterface.addColumn('Notifications', 'previewText', {
        type: Sequelize.STRING(120),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const dialect = getDialect(queryInterface);
    const tableDefinition = await queryInterface.describeTable('Notifications');

    if (dialect === 'postgres' || dialect === 'postgresql') {
      const [[constraint]] = await queryInterface.sequelize.query(
        `SELECT conname FROM pg_constraint WHERE conname = :constraintName LIMIT 1;`,
        { replacements: { constraintName: STATUS_CHECK_CONSTRAINT_NAME } },
      );

      if (constraint) {
        await queryInterface.sequelize.query(`
          ALTER TABLE "Notifications" DROP CONSTRAINT "${STATUS_CHECK_CONSTRAINT_NAME}";
        `);
      }
    }

    if (tableDefinition.previewText) {
      await queryInterface.removeColumn('Notifications', 'previewText');
    }

    if (tableDefinition.status) {
      await queryInterface.removeColumn('Notifications', 'status');
    }
  },
};
