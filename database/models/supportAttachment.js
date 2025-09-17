'use strict';

module.exports = (sequelize, DataTypes) => {
    const SupportAttachment = sequelize.define('SupportAttachment', {
        ticketId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        uploadedById: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        originalName: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        storageKey: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        mimeType: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        size: {
            type: DataTypes.INTEGER.UNSIGNED,
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
            SupportAttachment.hasOne(SupportMessage, {
                as: 'message',
                foreignKey: 'attachmentId',
                constraints: false
            });
        }
    };

    return SupportAttachment;
};
