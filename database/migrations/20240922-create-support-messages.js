'use strict';

const TABLE_NAME = 'SupportMessages';

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
            body: {
                type: Sequelize.TEXT,
                allowNull: false
            },
            isFromAgent: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
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
            name: 'support_messages_ticket_idx',
            fields: ['ticketId']
        });

        await queryInterface.addIndex(TABLE_NAME, {
            name: 'support_messages_sender_idx',
            fields: ['senderId']
        });
    },

    down: async (queryInterface) => {
        await queryInterface.removeIndex(TABLE_NAME, 'support_messages_sender_idx');
        await queryInterface.removeIndex(TABLE_NAME, 'support_messages_ticket_idx');
        await queryInterface.dropTable(TABLE_NAME);
    }
};
