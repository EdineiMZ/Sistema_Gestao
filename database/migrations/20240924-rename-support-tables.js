'use strict';

const OLD_TICKET_TABLE = 'SupportTickets';
const NEW_TICKET_TABLE = 'support_tickets';
const OLD_MESSAGE_TABLE = 'SupportMessages';
const NEW_MESSAGE_TABLE = 'support_messages';
const OLD_ATTACHMENT_TABLE = 'SupportAttachments';
const NEW_ATTACHMENT_TABLE = 'support_attachments';

const OLD_STATUS_ENUM = 'enum_SupportTickets_status';
const NEW_STATUS_ENUM = 'enum_support_tickets_status';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const dialect = queryInterface.sequelize.getDialect();

        // Renomear tabelas se existirem
        await queryInterface.sequelize.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '${OLD_TICKET_TABLE}') THEN
                    ALTER TABLE "${OLD_TICKET_TABLE}" RENAME TO ${NEW_TICKET_TABLE};
                END IF;
            END$$;
        `);

        await queryInterface.sequelize.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '${OLD_MESSAGE_TABLE}') THEN
                    ALTER TABLE "${OLD_MESSAGE_TABLE}" RENAME TO ${NEW_MESSAGE_TABLE};
                END IF;
            END$$;
        `);

        await queryInterface.sequelize.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '${OLD_ATTACHMENT_TABLE}') THEN
                    ALTER TABLE "${OLD_ATTACHMENT_TABLE}" RENAME TO ${NEW_ATTACHMENT_TABLE};
                END IF;
            END$$;
        `);

        // Renomear ENUM no Postgres
        if (dialect === 'postgres') {
            await queryInterface.sequelize.query(`
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = '${OLD_STATUS_ENUM}') THEN
                        ALTER TYPE "${OLD_STATUS_ENUM}" RENAME TO "${NEW_STATUS_ENUM}";
                    END IF;
                END$$;
            `);
        }

        // Ajustar referências ticketId/messageId
        await queryInterface.sequelize.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns 
                           WHERE table_name = '${NEW_MESSAGE_TABLE}' AND column_name = 'ticketId') THEN
                    ALTER TABLE ${NEW_MESSAGE_TABLE}
                    ALTER COLUMN "ticketId" SET NOT NULL;
                END IF;
            END$$;
        `);

        await queryInterface.sequelize.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns 
                           WHERE table_name = '${NEW_ATTACHMENT_TABLE}' AND column_name = 'ticketId') THEN
                    ALTER TABLE ${NEW_ATTACHMENT_TABLE}
                    ALTER COLUMN "ticketId" SET NOT NULL;
                END IF;
            END$$;
        `);

        await queryInterface.sequelize.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns 
                           WHERE table_name = '${NEW_ATTACHMENT_TABLE}' AND column_name = 'messageId') THEN
                    ALTER TABLE ${NEW_ATTACHMENT_TABLE}
                    ALTER COLUMN "messageId" DROP NOT NULL;
                END IF;
            END$$;
        `);
    },

    down: async (queryInterface, Sequelize) => {
        const dialect = queryInterface.sequelize.getDialect();

        // Reverter tabelas
        await queryInterface.sequelize.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '${NEW_ATTACHMENT_TABLE}') THEN
                    ALTER TABLE ${NEW_ATTACHMENT_TABLE} RENAME TO "${OLD_ATTACHMENT_TABLE}";
                END IF;
            END$$;
        `);

        await queryInterface.sequelize.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '${NEW_MESSAGE_TABLE}') THEN
                    ALTER TABLE ${NEW_MESSAGE_TABLE} RENAME TO "${OLD_MESSAGE_TABLE}";
                END IF;
            END$$;
        `);

        await queryInterface.sequelize.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '${NEW_TICKET_TABLE}') THEN
                    ALTER TABLE ${NEW_TICKET_TABLE} RENAME TO "${OLD_TICKET_TABLE}";
                END IF;
            END$$;
        `);

        // Reverter ENUM
        if (dialect === 'postgres') {
            await queryInterface.sequelize.query(`
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = '${NEW_STATUS_ENUM}') THEN
                        ALTER TYPE "${NEW_STATUS_ENUM}" RENAME TO "${OLD_STATUS_ENUM}";
                    END IF;
                END$$;
            `);
        }
    }
};
