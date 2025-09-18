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
    await queryInterface.addColumn('Notifications', 'status', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: STATUS_DEFAULT,
    });

    const dialect = getDialect(queryInterface);
    if (dialect === 'postgres' || dialect === 'postgresql') {
      const allowedStatuses = STATUS_VALUES.map((status) => `'${status}'`).join(', ');
      await queryInterface.sequelize.query(`
        ALTER TABLE "Notifications"
        ADD CONSTRAINT "${STATUS_CHECK_CONSTRAINT_NAME}"
        CHECK ("status" IN (${allowedStatuses}));
      `);
    }

    await queryInterface.addColumn('Notifications', 'previewText', {
      type: Sequelize.STRING(120),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    const dialect = getDialect(queryInterface);
    if (dialect === 'postgres' || dialect === 'postgresql') {
      await queryInterface.sequelize.query(`
        ALTER TABLE "Notifications" DROP CONSTRAINT IF EXISTS "${STATUS_CHECK_CONSTRAINT_NAME}";
      `);
    }

    await queryInterface.removeColumn('Notifications', 'previewText');
    await queryInterface.removeColumn('Notifications', 'status');
  },
};
