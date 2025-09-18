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
                hasContent(value) {
                    const normalized = typeof value === 'string' ? value.trim() : '';
                    if (!normalized && !this.isSystem && !this.attachmentId) {
                        throw new Error('Mensagem não pode estar vazia.');
                    }
                }
            }
        },
        isFromAgent: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        isSystem: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
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
