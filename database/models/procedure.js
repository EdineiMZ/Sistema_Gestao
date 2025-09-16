'use strict';

module.exports = (sequelize, DataTypes) => {
    const Procedure = sequelize.define('Procedure', {
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        price: {
            type: DataTypes.DECIMAL(10,2),
            allowNull: false
        },
        requiresRoom: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        roomId: {
            type: DataTypes.INTEGER,
            allowNull: true // se exige sala, associe
        },
        estimatedTime: {
            type: DataTypes.INTEGER, // em minutos
            allowNull: true
        },
        commissionType: {
            type: DataTypes.STRING, // 'percent' ou 'value'
            allowNull: true
        },
        commissionValue: {
            type: DataTypes.DECIMAL(10,2),
            allowNull: true
        },
        createdBy: {
            type: DataTypes.INTEGER, // user.id que cadastrou
            allowNull: true
        }
    }, {
        tableName: 'Procedures'
    });

    return Procedure;
};
