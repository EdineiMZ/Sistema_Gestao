'use strict';

module.exports = (sequelize, DataTypes) => {
    const SupportTicket = sequelize.define('SupportTicket', {
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Users',
                key: 'id'
            },
            onDelete: 'CASCADE'
        },
        subject: {
            type: DataTypes.STRING(150),
            allowNull: false,
            validate: {
                len: {
                    args: [3, 150],
                    msg: 'Assunto deve ter entre 3 e 150 caracteres.'
                }
            }
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM('open', 'in-progress', 'closed'),
            allowNull: false,
            defaultValue: 'open'
        },
        priority: {
            type: DataTypes.ENUM('low', 'medium', 'high'),
            allowNull: false,
            defaultValue: 'medium'
        },
        firstResponseAt: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        tableName: 'SupportTickets'
    });

    SupportTicket.associate = (models) => {
        SupportTicket.belongsTo(models.User, {
            as: 'requester',
            foreignKey: 'userId'
        });

        SupportTicket.hasMany(models.SupportAttachment, {
            as: 'attachments',
            foreignKey: 'ticketId',
            onDelete: 'CASCADE',
            hooks: true
        });
    };

    return SupportTicket;
};
