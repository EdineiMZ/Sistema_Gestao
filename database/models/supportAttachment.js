'use strict';

module.exports = (sequelize, DataTypes) => {
    const SupportAttachment = sequelize.define('SupportAttachment', {
        ticketId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        messageId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        uploadedById: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        fileName: {
            type: DataTypes.STRING(255),
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Nome do arquivo é obrigatório.'
                }
            }
        },
        storageKey: {
            type: DataTypes.STRING(255),
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Chave de armazenamento é obrigatória.'
                }
            }
        },
        checksum: {
            type: DataTypes.STRING(128),
            allowNull: true
        },
        contentType: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        fileSize: {
            type: DataTypes.BIGINT,
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Tamanho do arquivo inválido.'
                }
            }
        }
    }, {
        tableName: 'SupportAttachments',
        indexes: [
            { name: 'support_attachments_ticket_idx', fields: ['ticketId'] },
            { name: 'support_attachments_message_idx', fields: ['messageId'] },
            { name: 'support_attachments_uploader_idx', fields: ['uploadedById'] }
        ]
    });

    SupportAttachment.associate = (models) => {
        SupportAttachment.belongsTo(models.SupportTicket, {
            as: 'ticket',
            foreignKey: 'ticketId'
        });

        SupportAttachment.belongsTo(models.SupportMessage, {
            as: 'message',
            foreignKey: 'messageId'
        });

        SupportAttachment.belongsTo(models.User, {
            as: 'uploader',
            foreignKey: 'uploadedById'
        });
    };

    return SupportAttachment;
};
