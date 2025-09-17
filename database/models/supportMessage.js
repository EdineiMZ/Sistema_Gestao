'use strict';

module.exports = (sequelize, DataTypes) => {
    const SupportMessage = sequelize.define('SupportMessage', {
        ticketId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        senderId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        body: {
            type: DataTypes.TEXT,
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Mensagem não pode estar vazia.'
                }
            }
        },
        isFromAgent: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        }
    }, {
        tableName: 'SupportMessages',
        indexes: [
            { name: 'support_messages_ticket_idx', fields: ['ticketId'] },
            { name: 'support_messages_sender_idx', fields: ['senderId'] }
        ]
    });

    SupportMessage.associate = (models) => {
        SupportMessage.belongsTo(models.SupportTicket, {
            as: 'ticket',
            foreignKey: 'ticketId'
        });

        SupportMessage.belongsTo(models.User, {
            as: 'sender',
            foreignKey: 'senderId'
        });

        SupportMessage.hasMany(models.SupportAttachment, {
            as: 'attachments',
            foreignKey: 'messageId',
            onDelete: 'CASCADE'
        });
    };

    return SupportMessage;
};
