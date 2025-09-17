'use strict';

const TABLE_NAME = 'SupportAttachments';

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
                    model: 'SupportTickets',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            messageId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'SupportMessages',
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
            fileName: {
                type: Sequelize.STRING(255),
                allowNull: false
            },
            storageKey: {
                type: Sequelize.STRING(255),
                allowNull: false
            },
            checksum: {
                type: Sequelize.STRING(128),
                allowNull: true
            },
            contentType: {
                type: Sequelize.STRING(120),
                allowNull: true
            },
            fileSize: {
                type: Sequelize.BIGINT,
                allowNull: true
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
            name: 'support_attachments_ticket_idx',
            fields: ['ticketId']
        });

        await queryInterface.addIndex(TABLE_NAME, {
            name: 'support_attachments_message_idx',
            fields: ['messageId']
        });

        await queryInterface.addIndex(TABLE_NAME, {
            name: 'support_attachments_uploader_idx',
            fields: ['uploadedById']
        });
    },

    down: async (queryInterface) => {
        await queryInterface.removeIndex(TABLE_NAME, 'support_attachments_uploader_idx');
        await queryInterface.removeIndex(TABLE_NAME, 'support_attachments_message_idx');
        await queryInterface.removeIndex(TABLE_NAME, 'support_attachments_ticket_idx');
        await queryInterface.dropTable(TABLE_NAME);
    }
};
