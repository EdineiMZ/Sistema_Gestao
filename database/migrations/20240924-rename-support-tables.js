'use strict';

const PASCAL_TICKET_TABLE = 'SupportTickets';
const CAMEL_TICKET_TABLE = 'supportTickets';
const PASCAL_MESSAGE_TABLE = 'SupportMessages';
const CAMEL_MESSAGE_TABLE = 'supportMessages';
const PASCAL_ATTACHMENT_TABLE = 'SupportAttachments';
const CAMEL_ATTACHMENT_TABLE = 'supportAttachments';
const PASCAL_STATUS_ENUM = 'enum_SupportTickets_status';
const CAMEL_STATUS_ENUM = 'enum_supportTickets_status';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const transaction = await queryInterface.sequelize.transaction();

        const tableExists = async (tableName) => {
            try {
                await queryInterface.describeTable(tableName, { transaction });
                return true;
            } catch (error) {
                if (error?.original?.code === 'ER_NO_SUCH_TABLE' ||
                    error?.original?.code === 'SQLITE_ERROR' ||
                    /does not exist/i.test(error?.message ?? '')) {
                    return false;
                }
                throw error;
            }
        };

        try {
            const dialect = queryInterface.sequelize.getDialect();

            if (await tableExists(PASCAL_TICKET_TABLE)) {
                await queryInterface.renameTable(PASCAL_TICKET_TABLE, CAMEL_TICKET_TABLE, { transaction });
                if (dialect === 'postgres') {
                    await queryInterface.sequelize.query(
                        `ALTER TYPE "${PASCAL_STATUS_ENUM}" RENAME TO "${CAMEL_STATUS_ENUM}";`,
                        { transaction }
                    );
                }
            }

            if (await tableExists(PASCAL_MESSAGE_TABLE)) {
                await queryInterface.renameTable(PASCAL_MESSAGE_TABLE, CAMEL_MESSAGE_TABLE, { transaction });
            }

            if (await tableExists(PASCAL_ATTACHMENT_TABLE)) {
                await queryInterface.renameTable(PASCAL_ATTACHMENT_TABLE, CAMEL_ATTACHMENT_TABLE, { transaction });
            }

            if (await tableExists(CAMEL_MESSAGE_TABLE)) {
                await queryInterface.changeColumn(
                    CAMEL_MESSAGE_TABLE,
                    'ticketId',
                    {
                        type: Sequelize.INTEGER,
                        allowNull: false,
                        references: {
                            model: CAMEL_TICKET_TABLE,
                            key: 'id'
                        },
                        onUpdate: 'CASCADE',
                        onDelete: 'CASCADE'
                    },
                    { transaction }
                );
            }

            if (await tableExists(CAMEL_ATTACHMENT_TABLE)) {
                await queryInterface.changeColumn(
                    CAMEL_ATTACHMENT_TABLE,
                    'ticketId',
                    {
                        type: Sequelize.INTEGER,
                        allowNull: false,
                        references: {
                            model: CAMEL_TICKET_TABLE,
                            key: 'id'
                        },
                        onUpdate: 'CASCADE',
                        onDelete: 'CASCADE'
                    },
                    { transaction }
                );

                await queryInterface.changeColumn(
                    CAMEL_ATTACHMENT_TABLE,
                    'messageId',
                    {
                        type: Sequelize.INTEGER,
                        allowNull: false,
                        references: {
                            model: CAMEL_MESSAGE_TABLE,
                            key: 'id'
                        },
                        onUpdate: 'CASCADE',
                        onDelete: 'CASCADE'
                    },
                    { transaction }
                );
            }

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    },

    down: async (queryInterface, Sequelize) => {
        const transaction = await queryInterface.sequelize.transaction();

        const tableExists = async (tableName) => {
            try {
                await queryInterface.describeTable(tableName, { transaction });
                return true;
            } catch (error) {
                if (error?.original?.code === 'ER_NO_SUCH_TABLE' ||
                    error?.original?.code === 'SQLITE_ERROR' ||
                    /does not exist/i.test(error?.message ?? '')) {
                    return false;
                }
                throw error;
            }
        };

        try {
            const dialect = queryInterface.sequelize.getDialect();

            if (await tableExists(CAMEL_ATTACHMENT_TABLE)) {
                await queryInterface.renameTable(CAMEL_ATTACHMENT_TABLE, PASCAL_ATTACHMENT_TABLE, { transaction });
            }

            if (await tableExists(CAMEL_MESSAGE_TABLE)) {
                await queryInterface.renameTable(CAMEL_MESSAGE_TABLE, PASCAL_MESSAGE_TABLE, { transaction });
            }

            if (await tableExists(CAMEL_TICKET_TABLE)) {
                await queryInterface.renameTable(CAMEL_TICKET_TABLE, PASCAL_TICKET_TABLE, { transaction });
                if (dialect === 'postgres') {
                    await queryInterface.sequelize.query(
                        `ALTER TYPE "${CAMEL_STATUS_ENUM}" RENAME TO "${PASCAL_STATUS_ENUM}";`,
                        { transaction }
                    );
                }
            }

            if (await tableExists(PASCAL_MESSAGE_TABLE)) {
                await queryInterface.changeColumn(
                    PASCAL_MESSAGE_TABLE,
                    'ticketId',
                    {
                        type: Sequelize.INTEGER,
                        allowNull: false,
                        references: {
                            model: PASCAL_TICKET_TABLE,
                            key: 'id'
                        },
                        onUpdate: 'CASCADE',
                        onDelete: 'CASCADE'
                    },
                    { transaction }
                );
            }

            if (await tableExists(PASCAL_ATTACHMENT_TABLE)) {
                await queryInterface.changeColumn(
                    PASCAL_ATTACHMENT_TABLE,
                    'ticketId',
                    {
                        type: Sequelize.INTEGER,
                        allowNull: false,
                        references: {
                            model: PASCAL_TICKET_TABLE,
                            key: 'id'
                        },
                        onUpdate: 'CASCADE',
                        onDelete: 'CASCADE'
                    },
                    { transaction }
                );

                await queryInterface.changeColumn(
                    PASCAL_ATTACHMENT_TABLE,
                    'messageId',
                    {
                        type: Sequelize.INTEGER,
                        allowNull: false,
                        references: {
                            model: PASCAL_MESSAGE_TABLE,
                            key: 'id'
                        },
                        onUpdate: 'CASCADE',
                        onDelete: 'CASCADE'
                    },
                    { transaction }
                );
            }

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }
};
