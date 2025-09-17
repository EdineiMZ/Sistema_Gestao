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
        status: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'pending',
            validate: {
                isIn: [['pending', 'in_progress', 'resolved']]
            }
        },
        creatorId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            validate: {
                isInt: true
            }
        },
        assignedToId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            validate: {
                isInt: true
            }
        },
        lastMessageAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        firstResponseAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        resolvedAt: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        tableName: 'supportTickets',
        indexes: [
            {
                name: 'supportTickets_creatorId_status',
                fields: ['creatorId', 'status']
            },
            {
                name: 'supportTickets_assignedTo_status',
                fields: ['assignedToId', 'status']
            }
        ]
    });

    SupportTicket.associate = (models) => {
        const { User, SupportMessage, SupportAttachment } = models;

        if (User) {
            SupportTicket.belongsTo(User, {
                as: 'creator',
                foreignKey: 'creatorId',
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            });

            SupportTicket.belongsTo(User, {
                as: 'assignee',
                foreignKey: 'assignedToId',
                onDelete: 'SET NULL',
                onUpdate: 'CASCADE'
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
