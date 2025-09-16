'use strict';

const buildTimestampDefault = (queryInterface) => {
    const dialect = queryInterface.sequelize?.getDialect?.() || queryInterface.sequelize?.dialect?.name;
    if (typeof dialect === 'string' && dialect.toLowerCase() === 'sqlite') {
        return queryInterface.sequelize.literal("CURRENT_TIMESTAMP");
    }
    return queryInterface.sequelize.fn('NOW');
};

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('NotificationDispatchLogs', {
            id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                primaryKey: true
            },
            notificationId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Notifications',
                    key: 'id'
                },
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            },
            recipient: {
                type: Sequelize.STRING,
                allowNull: false
            },
            cycleKey: {
                type: Sequelize.STRING,
                allowNull: false
            },
            contextHash: {
                type: Sequelize.STRING(64),
                allowNull: false
            },
            context: {
                type: Sequelize.JSON,
                allowNull: true
            },
            sentAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: buildTimestampDefault(queryInterface)
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: buildTimestampDefault(queryInterface)
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: buildTimestampDefault(queryInterface)
            }
        });

        await queryInterface.addConstraint('NotificationDispatchLogs', {
            fields: ['notificationId', 'recipient', 'contextHash'],
            type: 'unique',
            name: 'notification_dispatch_unique_per_context'
        });

        await queryInterface.addIndex('NotificationDispatchLogs', {
            fields: ['notificationId', 'cycleKey'],
            name: 'notification_dispatch_cycle_idx'
        });

        await queryInterface.addIndex('NotificationDispatchLogs', {
            fields: ['notificationId', 'recipient'],
            name: 'notification_dispatch_recipient_idx'
        });
    },

    async down(queryInterface) {
        await queryInterface.removeIndex('NotificationDispatchLogs', 'notification_dispatch_recipient_idx');
        await queryInterface.removeIndex('NotificationDispatchLogs', 'notification_dispatch_cycle_idx');
        await queryInterface.removeConstraint('NotificationDispatchLogs', 'notification_dispatch_unique_per_context');
        await queryInterface.dropTable('NotificationDispatchLogs');
    }
};
