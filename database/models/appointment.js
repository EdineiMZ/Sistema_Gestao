'use strict';
module.exports = (sequelize, DataTypes) => {
    const Appointment = sequelize.define('Appointment', {
        description: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Descrição do agendamento é obrigatória.'
                },
                len: {
                    args: [3, 255],
                    msg: 'Descrição deve conter entre 3 e 255 caracteres.'
                }
            }
        },
        professionalId: {
            type: DataTypes.INTEGER,
            allowNull: false // usuário profissional (especialista ou superior)
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
            allowNull: false,
            validate: {
                isDate: {
                    msg: 'Data de início inválida.'
                }
            }
        },
        end: {
            type: DataTypes.DATE,
            allowNull: false,
            validate: {
                isDate: {
                    msg: 'Data de término inválida.'
                }
            }
        },
        status: {
            type: DataTypes.STRING,
            defaultValue: 'scheduled',
            validate: {
                isIn: {
                    args: [['scheduled', 'completed', 'cancelled', 'no-show', 'pending-confirmation']],
                    msg: 'Status de agendamento inválido.'
                }
            }
        },
        // Novo campo para confirmar se o pagamento foi realizado
        paymentConfirmed: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    }, {
        tableName: 'Appointments',
        validate: {
            endAfterStart() {
                if (this.start && this.end && new Date(this.end) <= new Date(this.start)) {
                    throw new Error('A data de término deve ser posterior à data de início.');
                }
            }
        }
    });

    return Appointment;
};
