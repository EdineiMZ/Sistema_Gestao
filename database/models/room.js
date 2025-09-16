'use strict';

module.exports = (sequelize, DataTypes) => {
    const Room = sequelize.define('Room', {
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        }
    }, {
        tableName: 'Rooms'
    });

    return Room;
};
