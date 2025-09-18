'use strict';

const TABLE_NAME = 'SupportTickets';
const STATUS_ENUM_NAME = 'enum_SupportTickets_status';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable(TABLE_NAME, {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            subject: {
                type: Sequelize.STRING(180),
                allowNull: false
            },
            status: {
                type: Sequelize.ENUM('pending', 'in_progress', 'resolved'),
                allowNull: false,
                defaultValue: 'pending'
            },
            creatorId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            assignedToId: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'Users',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            },
            resolvedAt: {
                type: Sequelize.DATE,
                allowNull: true
            },
            firstResponseAt: {
                type: Sequelize.DATE,
                allowNull: true
            },
            lastMessageAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
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

        // Índice em status
        await queryInterface.sequelize.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_indexes WHERE indexname = 'support_tickets_status_idx'
                ) THEN
                    CREATE INDEX support_tickets_status_idx ON "${TABLE_NAME}" ("status");
                END IF;
            END$$;
        `);

        // Índice em creatorId
        await queryInterface.sequelize.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_indexes WHERE indexname = 'support_tickets_creator_idx'
                ) THEN
                    CREATE INDEX support_tickets_creator_idx ON "${TABLE_NAME}" ("creatorId");
                END IF;
            END$$;
        `);

        // Índice em assignedToId
        await queryInterface.sequelize.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_indexes WHERE indexname = 'support_tickets_assignee_idx'
                ) THEN
                    CREATE INDEX support_tickets_assignee_idx ON "${TABLE_NAME}" ("assignedToId");
                END IF;
            END$$;
        `);
    },

    down: async (queryInterface) => {
        await queryInterface.removeIndex(TABLE_NAME, 'support_tickets_assignee_idx');
        await queryInterface.removeIndex(TABLE_NAME, 'support_tickets_creator_idx');
        await queryInterface.removeIndex(TABLE_NAME, 'support_tickets_status_idx');
        await queryInterface.dropTable(TABLE_NAME);

        if (queryInterface.sequelize.getDialect() === 'postgres') {
            await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${STATUS_ENUM_NAME}";`);
        }
    }
};
