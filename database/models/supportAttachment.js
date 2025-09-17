'use strict';

module.exports = (sequelize, DataTypes) => {
    const SupportAttachment = sequelize.define('SupportAttachment', {
        ticketId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        messageId: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        uploadedById: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        fileName: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        storageKey: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        contentType: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        fileSize: {
            type: DataTypes.BIGINT,
            allowNull: false
        },
        checksum: {
            type: DataTypes.STRING(64),
            allowNull: false
        }
    }, {
        tableName: 'supportAttachments',
        indexes: [
            {
                name: 'supportAttachments_ticketId_idx',
                fields: ['ticketId']
            },
            {
                name: 'supportAttachments_messageId_idx',
                fields: ['messageId']
            }
        ]
    });

    SupportAttachment.associate = (models) => {
        const { SupportTicket, SupportMessage, User } = models;

        if (SupportTicket) {
            SupportAttachment.belongsTo(SupportTicket, {
                as: 'ticket',
                foreignKey: 'ticketId',
                onDelete: 'CASCADE'
            });
        }

        if (User) {
            SupportAttachment.belongsTo(User, {
                as: 'uploader',
                foreignKey: 'uploadedById'
            });
        }

        if (SupportMessage) {
            SupportAttachment.belongsTo(SupportMessage, {
                as: 'message',
                foreignKey: 'messageId',
                onDelete: 'CASCADE'
            });
        }
    };

    return SupportAttachment;
};
