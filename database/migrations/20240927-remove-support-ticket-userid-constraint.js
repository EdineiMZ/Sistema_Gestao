'use strict';

const TICKET_TABLE_CANDIDATES = Object.freeze(['supportTickets', 'SupportTickets']);
const USER_TABLE_CANDIDATES = Object.freeze(['Users', 'users']);
const LEGACY_USER_COLUMN = 'userId';
const CREATOR_COLUMN = 'creatorId';

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

const isConstraintMissingError = (error) => {
    const driverCode = error?.original?.code || error?.parent?.code;
    const driverErrno = error?.original?.errno || error?.parent?.errno;
    const message = [
        error?.message,
        error?.original?.message,
        error?.parent?.message
    ].filter(Boolean).join(' ') || '';

    return driverCode === '42704' || // PostgreSQL undefined_object
        driverCode === '42P01' ||
        driverCode === 'ER_CANT_DROP_FIELD_OR_KEY' ||
        driverCode === 'ER_CANT_DROP_INDEX' ||
        driverErrno === 1091 || // MySQL: Can't drop
        /does not exist/i.test(message) ||
        /unknown constraint/i.test(message) ||
        /não existe/i.test(message);
};

const isConstraintAlreadyExistsError = (error) => {
    const driverCode = error?.original?.code || error?.parent?.code;
    const driverErrno = error?.original?.errno || error?.parent?.errno;
    const message = [
        error?.message,
        error?.original?.message,
        error?.parent?.message
    ].filter(Boolean).join(' ') || '';

    return driverCode === '42710' ||
        driverCode === '42P07' ||
        driverCode === 'ER_DUP_KEYNAME' ||
        driverCode === 'ER_DUP_ENTRY' ||
        driverErrno === 1061 ||
        /already exists/i.test(message);
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

const normalizeIdentifier = (identifier) => {
    if (!identifier) {
        return '';
    }

    return identifier
        .toString()
        .replace(/["'`]/g, '')
        .trim()
        .toLowerCase();
};

const getForeignKeyReferences = async (queryInterface, tableName) => {
    try {
        return await queryInterface.getForeignKeyReferencesForTable(tableName);
    } catch (error) {
        if (isTableMissingError(error)) {
            return [];
        }

        throw error;
    }
};

const columnExists = async (queryInterface, tableName, columnName) => {
    try {
        const tableDefinition = await queryInterface.describeTable(tableName);
        return Object.prototype.hasOwnProperty.call(tableDefinition, columnName);
    } catch (error) {
        if (isTableMissingError(error)) {
            return false;
        }

        throw error;
    }
};

const quoteIdentifier = (queryInterface, identifier) => {
    if (typeof queryInterface.quoteIdentifier === 'function') {
        return queryInterface.quoteIdentifier(identifier);
    }

    return `\`${identifier}\``;
};

const quoteTable = (queryInterface, tableName) => {
    if (typeof queryInterface.quoteTable === 'function') {
        return queryInterface.quoteTable(tableName);
    }

    return quoteIdentifier(queryInterface, tableName);
};

const dropConstraintIfExists = async (queryInterface, tableName, constraintName) => {
    if (!constraintName) {
        return;
    }

    try {
        await queryInterface.removeConstraint(tableName, constraintName);
    } catch (error) {
        if (isConstraintMissingError(error)) {
            return;
        }

        throw error;
    }
};

const ensureLegacyConstraint = async (queryInterface, tableName, constraintName, referencesTable) => {
    try {
        await queryInterface.addConstraint(tableName, {
            fields: [LEGACY_USER_COLUMN],
            type: 'foreign key',
            name: constraintName,
            references: {
                table: referencesTable,
                field: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
        });
    } catch (error) {
        if (isConstraintAlreadyExistsError(error)) {
            return;
        }

        throw error;
    }
};

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tableName = await resolveExistingTableName(queryInterface, TICKET_TABLE_CANDIDATES);
        if (!tableName) {
            return;
        }

        const foreignKeys = await getForeignKeyReferences(queryInterface, tableName);
        const legacyConstraints = foreignKeys.filter((fk) => normalizeIdentifier(fk?.columnName) === normalizeIdentifier(LEGACY_USER_COLUMN));

        for (const constraint of legacyConstraints) {
            const constraintName = constraint?.constraintName || constraint?.fkName || constraint?.name;
            await dropConstraintIfExists(queryInterface, tableName, constraintName);
        }

        const hasLegacyUser = await columnExists(queryInterface, tableName, LEGACY_USER_COLUMN);
        const hasCreator = await columnExists(queryInterface, tableName, CREATOR_COLUMN);

        if (hasLegacyUser && hasCreator) {
            const quotedTable = quoteTable(queryInterface, tableName);
            const quotedCreator = quoteIdentifier(queryInterface, CREATOR_COLUMN);
            const quotedUser = quoteIdentifier(queryInterface, LEGACY_USER_COLUMN);

            await queryInterface.sequelize.transaction(async (transaction) => {
                await queryInterface.sequelize.query(
                    `UPDATE ${quotedTable} SET ${quotedCreator} = ${quotedUser} WHERE ${quotedCreator} IS NULL`,
                    {
                        transaction,
                        type: Sequelize.QueryTypes.BULKUPDATE
                    }
                );
            });
        }
    },

    down: async (queryInterface) => {
        const tableName = await resolveExistingTableName(queryInterface, TICKET_TABLE_CANDIDATES);
        if (!tableName) {
            return;
        }

        const hasLegacyUser = await columnExists(queryInterface, tableName, LEGACY_USER_COLUMN);
        if (!hasLegacyUser) {
            return;
        }

        const foreignKeys = await getForeignKeyReferences(queryInterface, tableName);
        const legacyConstraints = foreignKeys.filter((fk) => normalizeIdentifier(fk?.columnName) === normalizeIdentifier(LEGACY_USER_COLUMN));

        if (legacyConstraints.length) {
            return;
        }

        const referencesTable = await resolveExistingTableName(queryInterface, USER_TABLE_CANDIDATES);
        if (!referencesTable) {
            return;
        }

        const defaultConstraintName = `${tableName}_${LEGACY_USER_COLUMN}_fkey`;
        await ensureLegacyConstraint(queryInterface, tableName, defaultConstraintName, referencesTable);
    }
};
