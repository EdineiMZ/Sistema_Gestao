'use strict';

module.exports = (sequelize, DataTypes) => {
    const UserNotificationPreference = sequelize.define('UserNotificationPreference', {
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true
        },
        emailEnabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        scheduledEnabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        }
    }, {
        tableName: 'UserNotificationPreferences'
    });

    UserNotificationPreference.associate = (models) => {
        UserNotificationPreference.belongsTo(models.User, {
            as: 'user',
            foreignKey: 'userId',
            onDelete: 'CASCADE'
        });
    };

    return UserNotificationPreference;
};
