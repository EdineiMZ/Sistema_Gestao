'use strict';

module.exports = (sequelize, DataTypes) => {
    const Notification = sequelize.define('Notification', {
        title: {
            type: DataTypes.STRING,
            allowNull: false
        },
        message: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        type: {
            type: DataTypes.STRING, // ex.: 'birthday', 'appointment', 'custom'
            allowNull: true
        },
        triggerDate: {
            type: DataTypes.DATE,
            allowNull: true
        },
        active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        // Se for para um usuário específico
        userId: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        // Se for para todos os usuários
        sendToAll: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        // NOVO CAMPO: indica se já foi enviada (evitar reenvio)
        sent: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    }, {
        tableName: 'Notifications'
    });

    return Notification;
};
