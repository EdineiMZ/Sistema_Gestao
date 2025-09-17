'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('FinanceAttachments', {
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

        await queryInterface.addIndex('FinanceAttachments', ['financeEntryId']);
        await queryInterface.addIndex('FinanceAttachments', ['checksum']);
    },

    async down(queryInterface) {
        await queryInterface.dropTable('FinanceAttachments');
    }
};
