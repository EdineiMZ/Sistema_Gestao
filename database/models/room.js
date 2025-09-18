'use strict';

module.exports = (sequelize, DataTypes) => {
    const Room = sequelize.define('Room', {
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            validate: {
                notEmpty: {
                    msg: 'Nome da sala é obrigatório.'
                },
                len: {
                    args: [2, 80],
                    msg: 'Nome da sala deve conter entre 2 e 80 caracteres.'
                }
            }
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
