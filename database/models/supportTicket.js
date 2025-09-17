'use strict';

module.exports = (sequelize, DataTypes) => {
    const SupportTicket = sequelize.define('SupportTicket', {
        subject: {
            type: DataTypes.STRING(150),
            allowNull: false,
            validate: {
                len: [3, 150]
            }
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        status: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'open',
            validate: {
                isIn: [['open', 'waiting', 'resolved', 'closed']]
            }
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false
        }
    }, {
        tableName: 'supportTickets',
        indexes: [
            {
                name: 'supportTickets_userId_status',
                fields: ['userId', 'status']
            }
        ]
    });

    SupportTicket.associate = (models) => {
        const { User, SupportMessage, SupportAttachment } = models;

        if (User) {
            SupportTicket.belongsTo(User, {
                as: 'requester',
                foreignKey: 'userId'
            });
        }

        if (SupportMessage) {
            SupportTicket.hasMany(SupportMessage, {
                as: 'messages',
                foreignKey: 'ticketId',
                onDelete: 'CASCADE'
            });
        }

        if (SupportAttachment) {
            SupportTicket.hasMany(SupportAttachment, {
                as: 'attachments',
                foreignKey: 'ticketId',
                onDelete: 'CASCADE'
            });
        }
    };

    return SupportTicket;
};
