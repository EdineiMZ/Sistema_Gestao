'use strict';

const TABLE_NAME = 'supportAttachments';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable(TABLE_NAME, {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            ticketId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'supportTickets',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            uploadedById: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'Users',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            },
            originalName: {
                type: Sequelize.STRING(255),
                allowNull: false
            },
            storageKey: {
                type: Sequelize.STRING(255),
                allowNull: false
            },
            checksum: {
                type: Sequelize.STRING(64),
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
            createdAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        });

        await queryInterface.addIndex(TABLE_NAME, {
            name: 'supportAttachments_ticketId_idx',
            fields: ['ticketId']
        });

        await queryInterface.addIndex(TABLE_NAME, {
            name: 'supportAttachments_uploaderId_idx',
            fields: ['uploadedById']
        });

        await queryInterface.addConstraint('supportMessages', {
            fields: ['attachmentId'],
            type: 'foreign key',
            name: 'supportMessages_attachmentId_fkey',
            references: {
                table: TABLE_NAME,
                field: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
        });
    },

    down: async (queryInterface) => {
        await queryInterface.removeConstraint('supportMessages', 'supportMessages_attachmentId_fkey');
        await queryInterface.removeIndex(TABLE_NAME, 'supportAttachments_uploaderId_idx');
        await queryInterface.removeIndex(TABLE_NAME, 'supportAttachments_ticketId_idx');
        await queryInterface.dropTable(TABLE_NAME);
    }
};
