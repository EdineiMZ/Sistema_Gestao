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
    const FinanceAttachment = sequelize.define('FinanceAttachment', {
        financeEntryId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'FinanceEntries',
                key: 'id'
            },
            onDelete: 'CASCADE'
        },
        fileName: {
            type: DataTypes.STRING(MAX_FILENAME_LENGTH),
            allowNull: false,
            validate: {
                len: {
                    args: [1, MAX_FILENAME_LENGTH],
                    msg: 'Nome do arquivo inválido.'
                }
            },
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
        storageKey: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true
        }
    }, {
        tableName: 'FinanceAttachments'
    });

    FinanceAttachment.associate = (models) => {
        FinanceAttachment.belongsTo(models.FinanceEntry, {
            as: 'entry',
            foreignKey: 'financeEntryId'
        });
    };

    return FinanceAttachment;
};
