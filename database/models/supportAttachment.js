'use strict';

module.exports = (sequelize, DataTypes) => {
    const SupportAttachment = sequelize.define('SupportAttachment', {
        ticketId: {
            type: DataTypes.INTEGER,
            allowNull: false
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
                name: 'supportAttachments_ticketId',
                fields: ['ticketId']
            }

        ]
    });

    SupportAttachment.associate = (models) => {
        const { SupportTicket, SupportMessage } = models;

        if (SupportTicket) {
            SupportAttachment.belongsTo(SupportTicket, {
                as: 'ticket',
                foreignKey: 'ticketId',
                onDelete: 'CASCADE'
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
