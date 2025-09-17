'use strict';

const MESSAGE_TABLE_CANDIDATES = Object.freeze(['supportMessages', 'SupportMessages']);
const AGENT_ROLE_HINTS = Object.freeze([
    'collaborator',
    'specialist',
    'manager',
    'admin',
    'agent',
    'support',
    'staff',
    'operator',
    'analyst',
    'system'
]);

const isTableMissingError = (error) => {
    const driverCode = error?.original?.code;
    const message = error?.message ?? '';

    return driverCode === 'ER_NO_SUCH_TABLE' ||
        driverCode === 'SQLITE_ERROR' ||
        /does not exist/i.test(message) ||
        /no such table/i.test(message) ||
        /unknown table/i.test(message);
};

const tableExists = async (queryInterface, tableName, options = {}) => {
    try {
        await queryInterface.describeTable(tableName, options);
        return true;
    } catch (error) {
        if (isTableMissingError(error)) {
            return false;
        }
        throw error;
    }
};

const resolveExistingTableName = async (queryInterface, candidates, options = {}) => {
    for (const name of candidates) {
        if (await tableExists(queryInterface, name, options)) {
            return name;
        }
    }

    return null;
};

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const transaction = await queryInterface.sequelize.transaction();
        try {
            const tableName = await resolveExistingTableName(
                queryInterface,
                MESSAGE_TABLE_CANDIDATES,
                { transaction }
            );

            if (!tableName) {
                await transaction.commit();
                return;
            }

            const describe = await queryInterface.describeTable(tableName, { transaction });
            const quote = (identifier) => queryInterface.queryGenerator.quoteIdentifier(identifier);
            const quotedTable = queryInterface.queryGenerator.quoteTable(tableName);

            if (!Object.prototype.hasOwnProperty.call(describe, 'body')) {
                await queryInterface.addColumn(
                    tableName,
                    'body',
                    {
                        type: Sequelize.TEXT,
                        allowNull: true
                    },
                    { transaction }
                );

                if (Object.prototype.hasOwnProperty.call(describe, 'content')) {
                    await queryInterface.sequelize.query(
                        `UPDATE ${quotedTable} SET ${quote('body')} = ${quote('content')} WHERE ${quote('content')} IS NOT NULL;`,
                        { transaction }
                    );
                }

                await queryInterface.sequelize.query(
                    `UPDATE ${quotedTable} SET ${quote('body')} = '' WHERE ${quote('body')} IS NULL;`,
                    { transaction }
                );

                await queryInterface.changeColumn(
                    tableName,
                    'body',
                    {
                        type: Sequelize.TEXT,
                        allowNull: false
                    },
                    { transaction }
                );
            }

            if (!Object.prototype.hasOwnProperty.call(describe, 'isFromAgent')) {
                await queryInterface.addColumn(
                    tableName,
                    'isFromAgent',
                    {
                        type: Sequelize.BOOLEAN,
                        allowNull: false,
                        defaultValue: false
                    },
                    { transaction }
                );

                if (Object.prototype.hasOwnProperty.call(describe, 'senderRole')) {
                    const roleList = AGENT_ROLE_HINTS
                        .map((value) => `'${value.replace(/'/g, "''")}'`)
                        .join(', ');

                    await queryInterface.sequelize.query(
                        `UPDATE ${quotedTable}
                            SET ${quote('isFromAgent')} = CASE
                                WHEN ${quote('senderRole')} IS NULL THEN 0
                                WHEN LOWER(TRIM(${quote('senderRole')})) IN (${roleList}) THEN 1
                                ELSE 0
                            END;`,
                        { transaction }
                    );
                }

                await queryInterface.sequelize.query(
                    `UPDATE ${quotedTable} SET ${quote('isFromAgent')} = 0 WHERE ${quote('isFromAgent')} IS NULL;`,
                    { transaction }
                );
            }

            if (!Object.prototype.hasOwnProperty.call(describe, 'isSystem')) {
                await queryInterface.addColumn(
                    tableName,
                    'isSystem',
                    {
                        type: Sequelize.BOOLEAN,
                        allowNull: false,
                        defaultValue: false
                    },
                    { transaction }
                );

                if (Object.prototype.hasOwnProperty.call(describe, 'messageType')) {
                    await queryInterface.sequelize.query(
                        `UPDATE ${quotedTable}
                            SET ${quote('isSystem')} = CASE
                                WHEN LOWER(TRIM(${quote('messageType')})) = 'system' THEN 1
                                ELSE 0
                            END;`,
                        { transaction }
                    );
                }
            }

            if (Object.prototype.hasOwnProperty.call(describe, 'senderRole')) {
                await queryInterface.removeColumn(tableName, 'senderRole', { transaction });
            }

            if (Object.prototype.hasOwnProperty.call(describe, 'messageType')) {
                await queryInterface.removeColumn(tableName, 'messageType', { transaction });
            }

            if (Object.prototype.hasOwnProperty.call(describe, 'content')) {
                await queryInterface.removeColumn(tableName, 'content', { transaction });
            }

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    },

    down: async (queryInterface, Sequelize) => {
        const transaction = await queryInterface.sequelize.transaction();
        try {
            const tableName = await resolveExistingTableName(
                queryInterface,
                MESSAGE_TABLE_CANDIDATES,
                { transaction }
            );

            if (!tableName) {
                await transaction.commit();
                return;
            }

            const describe = await queryInterface.describeTable(tableName, { transaction });
            const quote = (identifier) => queryInterface.queryGenerator.quoteIdentifier(identifier);
            const quotedTable = queryInterface.queryGenerator.quoteTable(tableName);

            if (!Object.prototype.hasOwnProperty.call(describe, 'senderRole')) {
                await queryInterface.addColumn(
                    tableName,
                    'senderRole',
                    {
                        type: Sequelize.STRING(20),
                        allowNull: true
                    },
                    { transaction }
                );

                await queryInterface.sequelize.query(
                    `UPDATE ${quotedTable}
                        SET ${quote('senderRole')} = CASE
                            WHEN ${quote('isFromAgent')} = 1 THEN 'agent'
                            ELSE 'client'
                        END;`,
                    { transaction }
                );

                await queryInterface.changeColumn(
                    tableName,
                    'senderRole',
                    {
                        type: Sequelize.STRING(20),
                        allowNull: false
                    },
                    { transaction }
                );
            }

            if (!Object.prototype.hasOwnProperty.call(describe, 'messageType')) {
                await queryInterface.addColumn(
                    tableName,
                    'messageType',
                    {
                        type: Sequelize.STRING(20),
                        allowNull: false,
                        defaultValue: 'text'
                    },
                    { transaction }
                );

                await queryInterface.sequelize.query(
                    `UPDATE ${quotedTable}
                        SET ${quote('messageType')} = CASE
                            WHEN ${quote('isSystem')} = 1 THEN 'system'
                            WHEN ${quote('attachmentId')} IS NOT NULL THEN 'file'
                            ELSE 'text'
                        END;`,
                    { transaction }
                );
            }

            if (!Object.prototype.hasOwnProperty.call(describe, 'content')) {
                await queryInterface.addColumn(
                    tableName,
                    'content',
                    {
                        type: Sequelize.TEXT,
                        allowNull: true
                    },
                    { transaction }
                );

                if (Object.prototype.hasOwnProperty.call(describe, 'body')) {
                    await queryInterface.sequelize.query(
                        `UPDATE ${quotedTable} SET ${quote('content')} = ${quote('body')};`,
                        { transaction }
                    );
                }
            }

            if (Object.prototype.hasOwnProperty.call(describe, 'body')) {
                await queryInterface.removeColumn(tableName, 'body', { transaction });
            }

            if (Object.prototype.hasOwnProperty.call(describe, 'isFromAgent')) {
                await queryInterface.removeColumn(tableName, 'isFromAgent', { transaction });
            }

            if (Object.prototype.hasOwnProperty.call(describe, 'isSystem')) {
                await queryInterface.removeColumn(tableName, 'isSystem', { transaction });
            }

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }
};
