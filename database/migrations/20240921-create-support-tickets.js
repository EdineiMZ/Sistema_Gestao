'use strict';

const DEFAULT_TABLE_NAME = 'supportTickets';
const CANDIDATE_TABLE_NAMES = Object.freeze(['supportTickets', 'SupportTickets']);
const SUPPORT_TICKETS_USER_STATUS_INDEX = 'supportTickets_userId_status';

const isTableMissingError = (error) => {
    const driverCode = error?.original?.code;
    const message = error?.message ?? '';

    return driverCode === 'ER_NO_SUCH_TABLE' ||
        driverCode === 'SQLITE_ERROR' ||
        /does not exist/i.test(message) ||
        /no such table/i.test(message) ||
        /unknown table/i.test(message);
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

const getIndexes = async (queryInterface, tableName) => {
    try {
        return await queryInterface.showIndex(tableName);
    } catch (error) {
        if (isTableMissingError(error)) {
            return [];
        }

        throw error;
    }
};

const normalizeIdentifier = (identifier) => {
    if (!identifier) {
        return '';
    }

    return identifier
        .toString()
        .replace(/["'`]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
};

const extractIndexFields = (index) => {
    if (!index?.fields) {
        return [];
    }

    return index.fields
        .map((field) => field.attribute || field.name || field.field || field.columnName)
        .filter(Boolean)
        .map((field) => field.toString().toLowerCase());
};

const hasIndex = (indexes, indexDefinition) => {
    const targetName = normalizeIdentifier(indexDefinition.name);
    const targetFields = (indexDefinition.fields || [])
        .map((field) => field.toString().toLowerCase());

    return indexes.some((index) => {
        const currentName = normalizeIdentifier(index.name);
        if (targetName && currentName === targetName) {
            return true;
        }

        const indexFields = extractIndexFields(index);
        if (indexFields.length === targetFields.length &&
            indexFields.every((field, position) => field === targetFields[position])) {
            return true;
        }

        return false;
    });
};

const isDuplicateIndexError = (error) => {
    const driverCode = error?.original?.code || error?.parent?.code;
    const mysqlErrno = error?.original?.errno || error?.parent?.errno;
    const message = error?.message ?? '';

    return driverCode === '42710' || // PostgreSQL duplicate_object
        driverCode === '42P07' || // PostgreSQL duplicate_table/index
        driverCode === 'ER_DUP_KEYNAME' || // MySQL duplicate index name
        driverCode === 'ER_DUP_ENTRY' || // MySQL duplicate entry/index
        mysqlErrno === 1061 || // MySQL duplicate key name
        /already exists/i.test(message);
};

const ensureIndex = async (queryInterface, tableName, indexDefinition) => {
    const existingIndexes = await getIndexes(queryInterface, tableName);
    if (hasIndex(existingIndexes, indexDefinition)) {
        return;
    }

    try {
        await queryInterface.addIndex(tableName, indexDefinition);
    } catch (error) {
        if (isDuplicateIndexError(error)) {
            return;
        }

        throw error;
    }
};

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const targetTableName = await resolveExistingTableName(
            queryInterface,
            CANDIDATE_TABLE_NAMES
        ) ?? DEFAULT_TABLE_NAME;

        if (!(await tableExists(queryInterface, targetTableName))) {
            await queryInterface.createTable(targetTableName, {
                id: {
                    type: Sequelize.INTEGER,
                    primaryKey: true,
                    autoIncrement: true
                },
            subject: {
                type: Sequelize.STRING(150),
                allowNull: false
            },
            description: {
                type: Sequelize.TEXT,
                allowNull: false
            },
            status: {
                type: Sequelize.STRING(20),
                allowNull: false,
                defaultValue: 'open'
            },
            userId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
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
        }

        await ensureIndex(queryInterface, targetTableName, {
            name: SUPPORT_TICKETS_USER_STATUS_INDEX,
            fields: ['userId', 'status']
        });
    },

    down: async (queryInterface) => {
        const targetTableName = await resolveExistingTableName(
            queryInterface,
            CANDIDATE_TABLE_NAMES
        );

        if (!targetTableName) {
            return;
        }

        const existingIndexes = await getIndexes(queryInterface, targetTableName);
        if (hasIndex(existingIndexes, {
            name: SUPPORT_TICKETS_USER_STATUS_INDEX,
            fields: ['userId', 'status']
        })) {
            await queryInterface.removeIndex(
                targetTableName,
                SUPPORT_TICKETS_USER_STATUS_INDEX
            );
        }

        if (await tableExists(queryInterface, targetTableName)) {
            await queryInterface.dropTable(targetTableName);
        }
    }
};
