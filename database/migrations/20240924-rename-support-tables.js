'use strict';

const PASCAL_TICKET_TABLE = 'SupportTickets';
const CAMEL_TICKET_TABLE = 'supportTickets';
const PASCAL_MESSAGE_TABLE = 'SupportMessages';
const CAMEL_MESSAGE_TABLE = 'supportMessages';
const PASCAL_ATTACHMENT_TABLE = 'SupportAttachments';
const CAMEL_ATTACHMENT_TABLE = 'supportAttachments';
const PASCAL_STATUS_ENUM = 'enum_SupportTickets_status';
const CAMEL_STATUS_ENUM = 'enum_supportTickets_status';

const isTableMissingError = (error) => {
    const driverCode = error?.original?.code || error?.parent?.code;
    const message = [
        error?.message,
        error?.original?.message,
        error?.parent?.message
    ].filter(Boolean).join(' ') || '';

    return driverCode === 'ER_NO_SUCH_TABLE' ||
        driverCode === 'SQLITE_ERROR' ||
        driverCode === '42P01' ||
        /does not exist/i.test(message) ||
        /no such table/i.test(message) ||
        /unknown table/i.test(message) ||
        /não existe/i.test(message);
};

const ignoreIfTableMissing = async (operation) => {
    try {
        return await operation();
    } catch (error) {
        if (isTableMissingError(error)) {
            return null;
        }

        throw error;
    }
};

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const transaction = await queryInterface.sequelize.transaction();

        const tableExists = async (tableName) => {
            try {
                await queryInterface.describeTable(tableName, { transaction });
                return true;
            } catch (error) {
                if (isTableMissingError(error)) {
                    return false;
                }
                throw error;
            }
        };

        const columnExists = async (tableName, columnName) => {
            try {
                const definition = await queryInterface.describeTable(tableName, { transaction });
                return Boolean(definition?.[columnName]);
            } catch (error) {
                if (isTableMissingError(error)) {
                    return false;
                }
                throw error;
            }
        };

        try {
            const dialect = queryInterface.sequelize.getDialect();

            const pascalTicketExists = await tableExists(PASCAL_TICKET_TABLE);
            const camelTicketExists = await tableExists(CAMEL_TICKET_TABLE);

            if (pascalTicketExists && !camelTicketExists) {
                await ignoreIfTableMissing(() => queryInterface.renameTable(
                    PASCAL_TICKET_TABLE,
                    CAMEL_TICKET_TABLE,
                    { transaction }
                ));
                if (dialect === 'postgres') {
                    await ignoreIfTableMissing(() => queryInterface.sequelize.query(
                        `ALTER TYPE "${PASCAL_STATUS_ENUM}" RENAME TO "${CAMEL_STATUS_ENUM}";`,
                        { transaction }
                    ));
                }
            }

            const pascalMessageExists = await tableExists(PASCAL_MESSAGE_TABLE);
            const camelMessageExists = await tableExists(CAMEL_MESSAGE_TABLE);

            if (pascalMessageExists && !camelMessageExists) {
                await ignoreIfTableMissing(() => queryInterface.renameTable(
                    PASCAL_MESSAGE_TABLE,
                    CAMEL_MESSAGE_TABLE,
                    { transaction }
                ));
            }

            const pascalAttachmentExists = await tableExists(PASCAL_ATTACHMENT_TABLE);
            const camelAttachmentExists = await tableExists(CAMEL_ATTACHMENT_TABLE);

            if (pascalAttachmentExists && !camelAttachmentExists) {
                await ignoreIfTableMissing(() => queryInterface.renameTable(
                    PASCAL_ATTACHMENT_TABLE,
                    CAMEL_ATTACHMENT_TABLE,
                    { transaction }
                ));
            }

            if (await tableExists(CAMEL_MESSAGE_TABLE) && await tableExists(CAMEL_TICKET_TABLE)) {
                await ignoreIfTableMissing(() => queryInterface.changeColumn(
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
                ));
            }

            if (await tableExists(CAMEL_ATTACHMENT_TABLE) && await tableExists(CAMEL_TICKET_TABLE)) {
                await ignoreIfTableMissing(() => queryInterface.changeColumn(
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
                ));

                if (await columnExists(CAMEL_ATTACHMENT_TABLE, 'messageId') && await tableExists(CAMEL_MESSAGE_TABLE)) {
                    await ignoreIfTableMissing(() => queryInterface.changeColumn(
                        CAMEL_ATTACHMENT_TABLE,
                        'messageId',
                        {
                            type: Sequelize.INTEGER,
                            allowNull: true,
                            references: {
                                model: CAMEL_MESSAGE_TABLE,
                                key: 'id'
                            },
                            onUpdate: 'CASCADE',
                            onDelete: 'CASCADE'
                        },
                        { transaction }
                    ));
                }
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
                if (isTableMissingError(error)) {
                    return false;
                }
                throw error;
            }
        };

        const columnExists = async (tableName, columnName) => {
            try {
                const definition = await queryInterface.describeTable(tableName, { transaction });
                return Boolean(definition?.[columnName]);
            } catch (error) {
                if (isTableMissingError(error)) {
                    return false;
                }
                throw error;
            }
        };

        try {
            const dialect = queryInterface.sequelize.getDialect();

            const camelAttachmentExists = await tableExists(CAMEL_ATTACHMENT_TABLE);
            const pascalAttachmentExists = await tableExists(PASCAL_ATTACHMENT_TABLE);

            if (camelAttachmentExists && !pascalAttachmentExists) {
                await ignoreIfTableMissing(() => queryInterface.renameTable(
                    CAMEL_ATTACHMENT_TABLE,
                    PASCAL_ATTACHMENT_TABLE,
                    { transaction }
                ));
            }

            const camelMessageExists = await tableExists(CAMEL_MESSAGE_TABLE);
            const pascalMessageExists = await tableExists(PASCAL_MESSAGE_TABLE);

            if (camelMessageExists && !pascalMessageExists) {
                await ignoreIfTableMissing(() => queryInterface.renameTable(
                    CAMEL_MESSAGE_TABLE,
                    PASCAL_MESSAGE_TABLE,
                    { transaction }
                ));
            }

            const camelTicketExists = await tableExists(CAMEL_TICKET_TABLE);
            const pascalTicketExists = await tableExists(PASCAL_TICKET_TABLE);

            if (camelTicketExists && !pascalTicketExists) {
                await ignoreIfTableMissing(() => queryInterface.renameTable(
                    CAMEL_TICKET_TABLE,
                    PASCAL_TICKET_TABLE,
                    { transaction }
                ));
                if (dialect === 'postgres') {
                    await ignoreIfTableMissing(() => queryInterface.sequelize.query(
                        `ALTER TYPE "${CAMEL_STATUS_ENUM}" RENAME TO "${PASCAL_STATUS_ENUM}";`,
                        { transaction }
                    ));
                }
            }

            if (await tableExists(PASCAL_MESSAGE_TABLE) && await tableExists(PASCAL_TICKET_TABLE)) {
                await ignoreIfTableMissing(() => queryInterface.changeColumn(
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
                ));
            }

            if (await tableExists(PASCAL_ATTACHMENT_TABLE) && await tableExists(PASCAL_TICKET_TABLE)) {
                await ignoreIfTableMissing(() => queryInterface.changeColumn(
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
                ));

                if (await columnExists(PASCAL_ATTACHMENT_TABLE, 'messageId') && await tableExists(PASCAL_MESSAGE_TABLE)) {
                    await ignoreIfTableMissing(() => queryInterface.changeColumn(
                        PASCAL_ATTACHMENT_TABLE,
                        'messageId',
                        {
                            type: Sequelize.INTEGER,
                            allowNull: true,
                            references: {
                                model: PASCAL_MESSAGE_TABLE,
                                key: 'id'
                            },
                            onUpdate: 'CASCADE',
                            onDelete: 'CASCADE'
                        },
                        { transaction }
                    ));
                }
            }

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }
};
