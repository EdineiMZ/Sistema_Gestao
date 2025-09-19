'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableName = 'UserNotificationPreferences';
    const uniqueConstraintName = 'user_notification_preferences_userId_unique';

    let tableExists = true;
    try {
      await queryInterface.describeTable(tableName);
    } catch (error) {
      const errorCode = error?.original?.code;
      const errorName = error?.name;
      const errorMessage = error?.message ?? '';
      const tableMissingErrors = new Set([
        'ER_NO_SUCH_TABLE',
        '42P01',
        'SQLITE_ERROR',
      ]);

      const isMissingTableError =
        errorName === 'SequelizeDatabaseError' &&
        (tableMissingErrors.has(errorCode) ||
          /does not exist/i.test(errorMessage) ||
          /no such table/i.test(errorMessage));

      if (!isMissingTableError) {
        throw error;
      }

      tableExists = false;
    }

    if (!tableExists) {
      await queryInterface.createTable(tableName, {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER,
        },
        userId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          unique: true,
          references: {
            model: 'Users',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        emailEnabled: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        scheduledEnabled: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        createdAt: {
          allowNull: false,
          type: Sequelize.DATE,
        },
        updatedAt: {
          allowNull: false,
          type: Sequelize.DATE,
        },
      });
    }

    // Guarantee the unique constraint on userId even if the table already existed.
    try {
      await queryInterface.addConstraint(tableName, {
        fields: ['userId'],
        type: 'unique',
        name: uniqueConstraintName,
      });
    } catch (error) {
      const duplicateConstraintErrors = new Set([
        'ER_DUP_KEYNAME',
        '42P07',
        '42710',
        'SQLITE_CONSTRAINT',
      ]);

      const errorCode = error?.original?.code;
      const errorName = error?.name;
      const errorMessage = error?.message ?? '';

      const isDuplicateConstraintError =
        errorName === 'SequelizeDatabaseError' &&
        (duplicateConstraintErrors.has(errorCode) ||
          /duplicate/i.test(errorMessage) ||
          /already exists/i.test(errorMessage));

      if (!isDuplicateConstraintError) {
        throw error;
      }
    }
  },

  async down(queryInterface) {
    const tableName = 'UserNotificationPreferences';

    try {
      await queryInterface.describeTable(tableName);
    } catch (error) {
      const errorCode = error?.original?.code;
      const errorName = error?.name;
      const errorMessage = error?.message ?? '';
      const tableMissingErrors = new Set([
        'ER_NO_SUCH_TABLE',
        '42P01',
        'SQLITE_ERROR',
      ]);

      const isMissingTableError =
        errorName === 'SequelizeDatabaseError' &&
        (tableMissingErrors.has(errorCode) ||
          /does not exist/i.test(errorMessage) ||
          /no such table/i.test(errorMessage));

      if (isMissingTableError) {
        return;
      }

      throw error;
    }

    await queryInterface.dropTable(tableName);
  },
};
