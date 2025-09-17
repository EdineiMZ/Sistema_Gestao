'use strict';

const path = require('path');

const MAX_FILENAME_LENGTH = 255;

const sanitizeFileName = (name) => {
    if (!name) {
        return 'anexo';
    }

    const base = path.basename(String(name)).replace(/[^\w\d._-]+/g, '-');
    const trimmed = base.replace(/-+/g, '-').replace(/^-|-$/g, '');

    if (!trimmed) {
        return 'anexo';
    }

    return trimmed.slice(0, MAX_FILENAME_LENGTH);
};

module.exports = (sequelize, DataTypes) => {
    const SupportAttachment = sequelize.define('SupportAttachment', {
        ticketId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'SupportTickets',
                key: 'id'
            },
            onDelete: 'CASCADE'
        },
        fileName: {
            type: DataTypes.STRING(MAX_FILENAME_LENGTH),
            allowNull: false,
            set(value) {
                this.setDataValue('fileName', sanitizeFileName(value));
            }
        },
        mimeType: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        size: {
            type: DataTypes.BIGINT,
            allowNull: false,
            validate: {
                min: 0
            }
        },
        checksum: {
            type: DataTypes.STRING(128),
            allowNull: false
        },
        data: {
            type: DataTypes.BLOB('long'),
            allowNull: false
        }
    }, {
        tableName: 'SupportAttachments'
    });

    SupportAttachment.associate = (models) => {
        SupportAttachment.belongsTo(models.SupportTicket, {
            as: 'ticket',
            foreignKey: 'ticketId'
        });
    };

    return SupportAttachment;
};
