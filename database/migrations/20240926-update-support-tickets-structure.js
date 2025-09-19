'use strict';

const TICKET_TABLE_CANDIDATES = Object.freeze(['supportTickets', 'SupportTickets']);
const USER_TABLE = 'Users';
const OLD_STATUS_INDEX = 'supportTickets_userId_status';
const NEW_STATUS_INDEX = 'supportTickets_creatorId_status';
const ASSIGNEE_STATUS_INDEX = 'supportTickets_assignedTo_status';

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
        /não existe/i.test(message) ||
        /no description found/i.test(message);
};

const tableExists = async (queryInterface, tableName) => {
    try {
        await queryInterface.describeTable(tableName);
        return true;
    } catch (error) {
        if (isTableMissingError(error)) {
            return false;
        }

        throw error;
    }
};

const resolveExistingTableName = async (queryInterface, candidates) => {
    for (const name of candidates) {
        if (await tableExists(queryInterface, name)) {
            return name;
        }
    }

    return null;
};

const columnExists = async (queryInterface, tableName, columnName) => {
    try {
        const description = await queryInterface.describeTable(tableName);
        return Object.prototype.hasOwnProperty.call(description, columnName);
    } catch (error) {
        if (isTableMissingError(error)) {
            return false;
        }

        throw error;
    }
};

const getIndexNames = async (queryInterface, tableName) => {
    try {
        const indexes = await queryInterface.showIndex(tableName);
        return indexes.map((index) => index.name);
    } catch (error) {
        if (isTableMissingError(error)) {
            return [];
        }

        throw error;
    }
};

const dropIndexIfExists = async (queryInterface, tableName, indexName) => {
    const indexes = await getIndexNames(queryInterface, tableName);
    if (indexes.includes(indexName)) {
        await queryInterface.removeIndex(tableName, indexName);
    }
};

const quoteIdentifier = (queryInterface, identifier) => {
    if (typeof queryInterface.quoteIdentifier === 'function') {
        return queryInterface.quoteIdentifier(identifier);
    }

    const qi = queryInterface.sequelize?.getQueryInterface?.();
    if (qi?.queryGenerator?.quoteIdentifier) {
        return qi.queryGenerator.quoteIdentifier(identifier);
    }

    return `\`${identifier.replace(/`/g, '``')}\``;
};

const addUserForeignKey = async (queryInterface, tableName, column, options = {}) => {
    const constraintName = `${tableName}_${column}_fkey`;
    const constraints = await queryInterface.getForeignKeyReferencesForTable(tableName, options);
    const alreadyExists = constraints.some((constraint) => constraint.columnName === column);

    if (!alreadyExists) {
        await queryInterface.addConstraint(tableName, {
            fields: [column],
            type: 'foreign key',
            name: constraintName,
            references: {
                table: USER_TABLE,
                field: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: options.onDelete ?? 'CASCADE'
        }, options);
    }
};

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tableName = await resolveExistingTableName(queryInterface, TICKET_TABLE_CANDIDATES);
        if (!tableName) {
            return;
        }

        const transaction = await queryInterface.sequelize.transaction();

        try {
            const dialect = queryInterface.sequelize.getDialect();
            const quotedTable = quoteIdentifier(queryInterface, tableName);

            if (!await columnExists(queryInterface, tableName, 'creatorId')) {
                await queryInterface.addColumn(tableName, 'creatorId', {
                    type: Sequelize.INTEGER,
                    allowNull: dialect === 'sqlite'
                }, { transaction });
            }

            if (!await columnExists(queryInterface, tableName, 'assignedToId')) {
                await queryInterface.addColumn(tableName, 'assignedToId', {
                    type: Sequelize.INTEGER,
                    allowNull: true
                }, { transaction });
            }

            if (!await columnExists(queryInterface, tableName, 'lastMessageAt')) {
                await queryInterface.addColumn(tableName, 'lastMessageAt', {
                    type: Sequelize.DATE,
                    allowNull: true
                }, { transaction });
            }

            if (!await columnExists(queryInterface, tableName, 'firstResponseAt')) {
                await queryInterface.addColumn(tableName, 'firstResponseAt', {
                    type: Sequelize.DATE,
                    allowNull: true
                }, { transaction });
            }

            if (!await columnExists(queryInterface, tableName, 'resolvedAt')) {
                await queryInterface.addColumn(tableName, 'resolvedAt', {
                    type: Sequelize.DATE,
                    allowNull: true
                }, { transaction });
            }

            const quotedStatus = quoteIdentifier(queryInterface, 'status');

            const statusTransitions = [
                { from: ['open'], to: 'pending' },
                { from: ['waiting'], to: 'in_progress' },
                { from: ['closed'], to: 'resolved' }
            ];

            for (const transition of statusTransitions) {
                const values = transition.from.map((value) => `'${value}'`).join(', ');
                await queryInterface.sequelize.query(
                    `UPDATE ${quotedTable} SET ${quotedStatus} = '${transition.to}' WHERE ${quotedStatus} IN (${values});`,
                    { transaction }
                );
            }

            if (await columnExists(queryInterface, tableName, 'userId')) {
                const quotedCreator = quoteIdentifier(queryInterface, 'creatorId');
                const quotedUser = quoteIdentifier(queryInterface, 'userId');

                await queryInterface.sequelize.query(
                    `UPDATE ${quotedTable} SET ${quotedCreator} = ${quotedUser} WHERE ${quotedCreator} IS NULL AND ${quotedUser} IS NOT NULL;`,
                    { transaction }
                );
            }

            if (dialect !== 'sqlite') {
                await queryInterface.changeColumn(tableName, 'creatorId', {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: {
                        model: USER_TABLE,
                        key: 'id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE'
                }, { transaction });
            }

            await addUserForeignKey(queryInterface, tableName, 'creatorId', {
                onDelete: 'CASCADE',
                transaction
            });
            await addUserForeignKey(queryInterface, tableName, 'assignedToId', {
                onDelete: 'SET NULL',
                transaction
            });

            await dropIndexIfExists(queryInterface, tableName, OLD_STATUS_INDEX);

            const existingIndexes = await getIndexNames(queryInterface, tableName);
            if (!existingIndexes.includes(NEW_STATUS_INDEX)) {
                await queryInterface.addIndex(tableName, {
                    name: NEW_STATUS_INDEX,
                    fields: ['creatorId', 'status']
                }, { transaction });
            }

            if (!existingIndexes.includes(ASSIGNEE_STATUS_INDEX)) {
                await queryInterface.addIndex(tableName, {
                    name: ASSIGNEE_STATUS_INDEX,
                    fields: ['assignedToId', 'status']
                }, { transaction });
            }

            if (await columnExists(queryInterface, tableName, 'description')) {
                await queryInterface.removeColumn(tableName, 'description', { transaction });
            }

            if (await columnExists(queryInterface, tableName, 'userId')) {
                await queryInterface.removeColumn(tableName, 'userId', { transaction });
            }

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    },

    down: async (queryInterface, Sequelize) => {
        const tableName = await resolveExistingTableName(queryInterface, TICKET_TABLE_CANDIDATES);
        if (!tableName) {
            return;
        }

        const transaction = await queryInterface.sequelize.transaction();

        try {
            const dialect = queryInterface.sequelize.getDialect();
            const quotedTable = quoteIdentifier(queryInterface, tableName);

            await dropIndexIfExists(queryInterface, tableName, NEW_STATUS_INDEX);
            await dropIndexIfExists(queryInterface, tableName, ASSIGNEE_STATUS_INDEX);

            if (!await columnExists(queryInterface, tableName, 'description')) {
                await queryInterface.addColumn(tableName, 'description', {
                    type: Sequelize.TEXT,
                    allowNull: true
                }, { transaction });
            }

            if (!await columnExists(queryInterface, tableName, 'userId')) {
                await queryInterface.addColumn(tableName, 'userId', {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: {
                        model: USER_TABLE,
                        key: 'id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE'
                }, { transaction });
            }

            if (await columnExists(queryInterface, tableName, 'creatorId')) {
                const quotedCreator = quoteIdentifier(queryInterface, 'creatorId');
                const quotedUser = quoteIdentifier(queryInterface, 'userId');

                await queryInterface.sequelize.query(
                    `UPDATE ${quotedTable} SET ${quotedUser} = ${quotedCreator} WHERE ${quotedUser} IS NULL AND ${quotedCreator} IS NOT NULL;`,
                    { transaction }
                );
            }

            const quotedStatus = quoteIdentifier(queryInterface, 'status');
            const statusRollback = [
                { from: ['pending'], to: 'open' },
                { from: ['in_progress'], to: 'waiting' }
            ];

            for (const transition of statusRollback) {
                const values = transition.from.map((value) => `'${value}'`).join(', ');
                await queryInterface.sequelize.query(
                    `UPDATE ${quotedTable} SET ${quotedStatus} = '${transition.to}' WHERE ${quotedStatus} IN (${values});`,
                    { transaction }
                );
            }

            if (dialect !== 'sqlite') {
                await queryInterface.changeColumn(tableName, 'userId', {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: {
                        model: USER_TABLE,
                        key: 'id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE'
                }, { transaction });
            }

            const indexes = await getIndexNames(queryInterface, tableName);
            if (!indexes.includes(OLD_STATUS_INDEX)) {
                await queryInterface.addIndex(tableName, {
                    name: OLD_STATUS_INDEX,
                    fields: ['userId', 'status']
                }, { transaction });
            }

            if (await columnExists(queryInterface, tableName, 'resolvedAt')) {
                await queryInterface.removeColumn(tableName, 'resolvedAt', { transaction });
            }

            if (await columnExists(queryInterface, tableName, 'firstResponseAt')) {
                await queryInterface.removeColumn(tableName, 'firstResponseAt', { transaction });
            }

            if (await columnExists(queryInterface, tableName, 'lastMessageAt')) {
                await queryInterface.removeColumn(tableName, 'lastMessageAt', { transaction });
            }

            if (await columnExists(queryInterface, tableName, 'assignedToId')) {
                await queryInterface.removeColumn(tableName, 'assignedToId', { transaction });
            }

            if (await columnExists(queryInterface, tableName, 'creatorId')) {
                await queryInterface.removeColumn(tableName, 'creatorId', { transaction });
            }

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }
};
