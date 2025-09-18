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
        messageHtml: {
            type: DataTypes.TEXT,
            allowNull: true
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
        filters: {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: {}
        },
        segmentFilters: {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: {}
        },
        repeatFrequency: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'none',
            validate: {
                isIn: {
                    args: [['none', 'daily', 'weekly', 'monthly']],
                    msg: 'Frequência de repetição inválida.'
                }
            }
        },
        scheduledAt: {
            type: DataTypes.DATE,
            allowNull: true,
            validate: {
                isDate: {
                    msg: 'Data de agendamento inválida.'
                }
            }
        },
        status: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'draft',
            validate: {
                isIn: {
                    args: [['draft', 'scheduled', 'queued', 'sending', 'sent', 'failed', 'cancelled']],
                    msg: 'Status de campanha inválido.'
                }
            }
        },
        accentColor: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: '#0d6efd',
            validate: {
                is: {
                    args: [/^#([0-9A-Fa-f]{3}){1,2}$/],
                    msg: 'Cor do destaque inválida.'
                }
            }
        },
        previewText: {
            type: DataTypes.STRING,
            allowNull: true,
            validate: {
                len: {
                    args: [0, 120],
                    msg: 'Texto de pré-visualização deve ter no máximo 120 caracteres.'
                }
            }
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

    Notification.associate = (models) => {
        Notification.hasMany(models.NotificationDispatchLog, {
            as: 'dispatchLogs',
            foreignKey: 'notificationId'
        });
    };

    return Notification;
};
