'use strict';

const TABLE_NAME = 'supportMessages';

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
            senderId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            senderRole: {
                type: Sequelize.STRING(20),
                allowNull: false
            },
            messageType: {
                type: Sequelize.STRING(20),
                allowNull: false,
                defaultValue: 'text'
            },
            content: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            attachmentId: {
                type: Sequelize.INTEGER,
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
            name: 'supportMessages_ticketId_createdAt',
            fields: ['ticketId', 'createdAt']
        });

        await queryInterface.addIndex(TABLE_NAME, {
            name: 'supportMessages_senderId_idx',
            fields: ['senderId']
        });

        await queryInterface.addIndex(TABLE_NAME, {
            name: 'supportMessages_attachmentId_idx',
            fields: ['attachmentId']
        });
    },

    down: async (queryInterface) => {
        await queryInterface.removeIndex(TABLE_NAME, 'supportMessages_attachmentId_idx');
        await queryInterface.removeIndex(TABLE_NAME, 'supportMessages_senderId_idx');
        await queryInterface.removeIndex(TABLE_NAME, 'supportMessages_ticketId_createdAt');
        await queryInterface.dropTable(TABLE_NAME);
    }
};
