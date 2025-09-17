'use strict';

const { TICKET_STATUSES, TICKET_STATUS_VALUES } = require('../../src/constants/support');

module.exports = (sequelize, DataTypes) => {
    const SupportTicket = sequelize.define('SupportTicket', {
        subject: {
            type: DataTypes.STRING(180),
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Assunto do chamado é obrigatório.'
                },
                len: {
                    args: [4, 180],
                    msg: 'Assunto deve ter entre 4 e 180 caracteres.'
                }
            }
        },
        status: {
            type: DataTypes.ENUM(...TICKET_STATUS_VALUES),
            defaultValue: TICKET_STATUSES.PENDING,
            allowNull: false,
            validate: {
                isIn: {
                    args: [TICKET_STATUS_VALUES],
                    msg: 'Status do chamado inválido.'
                }
            }
        },
        creatorId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        assignedToId: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        resolvedAt: {
            type: DataTypes.DATE,
            allowNull: true

        },
        firstResponseAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        lastMessageAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        tableName: 'SupportTickets',
        indexes: [
            { name: 'support_tickets_status_idx', fields: ['status'] },
            { name: 'support_tickets_creator_idx', fields: ['creatorId'] },
            { name: 'support_tickets_assignee_idx', fields: ['assignedToId'] }
        ]
    });

    SupportTicket.STATUS = TICKET_STATUSES;
    SupportTicket.STATUS_VALUES = TICKET_STATUS_VALUES;

    SupportTicket.associate = (models) => {
        SupportTicket.belongsTo(models.User, {
            as: 'creator',
            foreignKey: 'creatorId'
        });

        SupportTicket.belongsTo(models.User, {
            as: 'assignee',
            foreignKey: 'assignedToId'
        });

        SupportTicket.hasMany(models.SupportMessage, {
            as: 'messages',
            foreignKey: 'ticketId',
            onDelete: 'CASCADE'
        });
    };

    return SupportTicket;
};
