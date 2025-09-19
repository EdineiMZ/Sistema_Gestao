'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        const tableName = 'FinanceAttachments';
        let tableExists = await queryInterface
            .describeTable(tableName)
            .then(() => true)
            .catch(() => false);

        if (!tableExists) {
            await queryInterface.createTable(tableName, {
                id: {
                    allowNull: false,
                    autoIncrement: true,
                    primaryKey: true,
                    type: Sequelize.INTEGER
                },
                financeEntryId: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: {
                        model: 'FinanceEntries',
                        key: 'id'
                    },
                    onDelete: 'CASCADE',
                    onUpdate: 'CASCADE'
                },
                fileName: {
                    type: Sequelize.STRING(255),
                    allowNull: false
                },
                mimeType: {
                    type: Sequelize.STRING(120),
                    allowNull: false
                },
                size: {
                    type: Sequelize.BIGINT,
                    allowNull: false
                },
                checksum: {
                    type: Sequelize.STRING(128),
                    allowNull: false
                },
                storageKey: {
                    type: Sequelize.STRING(255),
                    allowNull: false,
                    unique: true
                },
                createdAt: {
                    allowNull: false,
                    type: Sequelize.DATE,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                },
                updatedAt: {
                    allowNull: false,
                    type: Sequelize.DATE,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                }
            });

            tableExists = true;
        }

        if (tableExists) {
            const indexes = await queryInterface.showIndex(tableName);
            const hasIndex = (name, fields) =>
                indexes.some((index) => {
                    if (index.name === name) {
                        return true;
                    }

                    if (!index.fields) {
                        return false;
                    }

                    const indexFields = index.fields.map((field) =>
                        field.attribute || field.name || field.columnName || field.column || field.field || field
                    );

                    return (
                        indexFields.length === fields.length &&
                        fields.every((fieldName, position) => indexFields[position] === fieldName)
                    );
                });

            if (!hasIndex('finance_attachments_finance_entry_idx', ['financeEntryId'])) {
                await queryInterface.addIndex(tableName, {
                    fields: ['financeEntryId'],
                    name: 'finance_attachments_finance_entry_idx'
                });
            }

            if (!hasIndex('finance_attachments_checksum_idx', ['checksum'])) {
                await queryInterface.addIndex(tableName, {
                    fields: ['checksum'],
                    name: 'finance_attachments_checksum_idx'
                });
            }
        }
    },

    async down(queryInterface) {
        const tableName = 'FinanceAttachments';
        const tableExists = await queryInterface
            .describeTable(tableName)
            .then(() => true)
            .catch(() => false);

        if (!tableExists) {
            return;
        }

        const indexes = await queryInterface.showIndex(tableName);

        if (indexes.some((index) => index.name === 'finance_attachments_checksum_idx')) {
            await queryInterface.removeIndex(tableName, 'finance_attachments_checksum_idx');
        }

        if (indexes.some((index) => index.name === 'finance_attachments_finance_entry_idx')) {
            await queryInterface.removeIndex(tableName, 'finance_attachments_finance_entry_idx');
        }

        await queryInterface.dropTable(tableName);
    }
};
