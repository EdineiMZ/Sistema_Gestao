'use strict';

module.exports = (sequelize, DataTypes) => {
    const NotificationDispatchLog = sequelize.define('NotificationDispatchLog', {
        notificationId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        recipient: {
            type: DataTypes.STRING,
            allowNull: false
        },
        cycleKey: {
            type: DataTypes.STRING,
            allowNull: false
        },
        contextHash: {
            type: DataTypes.STRING(64),
            allowNull: false
        },
        context: {
            type: DataTypes.JSON,
            allowNull: true
        },
        sentAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        tableName: 'NotificationDispatchLogs',
        indexes: [
            { fields: ['notificationId', 'cycleKey'] },
            { fields: ['notificationId', 'recipient'] }
        ]
    });

    NotificationDispatchLog.associate = (models) => {
        NotificationDispatchLog.belongsTo(models.Notification, {
            foreignKey: 'notificationId',
            as: 'notification',
            onDelete: 'CASCADE'
        });
    };

    return NotificationDispatchLog;
};
