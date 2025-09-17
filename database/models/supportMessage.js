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
        senderRole: {
            type: DataTypes.STRING(20),
            allowNull: false
        },
        messageType: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'text',
            validate: {
                isIn: [['text', 'file', 'system']]
            }
        },
        content: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        attachmentId: {
            type: DataTypes.INTEGER,
            allowNull: true
        }
    }, {
        tableName: 'supportMessages',
        indexes: [
            {
                name: 'supportMessages_ticketId_createdAt',
                fields: ['ticketId', 'createdAt']
            }
        ]
    });

    SupportMessage.associate = (models) => {
        const { SupportTicket, User, SupportAttachment } = models;

        if (SupportTicket) {
            SupportMessage.belongsTo(SupportTicket, {
                as: 'ticket',
                foreignKey: 'ticketId',
                onDelete: 'CASCADE'
            });
        }

        if (User) {
            SupportMessage.belongsTo(User, {
                as: 'sender',
                foreignKey: 'senderId'
            });
        }

        if (SupportAttachment) {
            SupportMessage.belongsTo(SupportAttachment, {
                as: 'attachment',
                foreignKey: 'attachmentId'
            });
        }
    };

    return SupportMessage;
};
