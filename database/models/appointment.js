'use strict';
module.exports = (sequelize, DataTypes) => {
    const Appointment = sequelize.define('Appointment', {
        description: DataTypes.STRING,
        professionalId: {
            type: DataTypes.INTEGER,
            allowNull: false // usuário profissional (role>1)
        },
        // Novo campo para cliente
        clientEmail: {
            type: DataTypes.STRING,
            allowNull: true
        },
        // ou se quiser relacionar com userId do cliente, ex:
        // clientId: { type: DataTypes.INTEGER, allowNull: true }

        roomId: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        procedureId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        start: {
            type: DataTypes.DATE,
            allowNull: false
        },
        end: {
            type: DataTypes.DATE,
            allowNull: false
        },
        status: {
            type: DataTypes.STRING,
            defaultValue: 'scheduled'
        },
        // Novo campo para confirmar se o pagamento foi realizado
        paymentConfirmed: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    }, {
        tableName: 'Appointments'
    });

    return Appointment;
};
