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

        const existingIndexes = await getIndexNames(queryInterface, targetTableName);
        if (!existingIndexes.includes(SUPPORT_TICKETS_USER_STATUS_INDEX)) {
            await queryInterface.addIndex(targetTableName, {
                name: SUPPORT_TICKETS_USER_STATUS_INDEX,
                fields: ['userId', 'status']
            });
        }
    },

    down: async (queryInterface) => {
        const targetTableName = await resolveExistingTableName(
            queryInterface,
            CANDIDATE_TABLE_NAMES
        );

        if (!targetTableName) {
            return;
        }

        const existingIndexes = await getIndexNames(queryInterface, targetTableName);
        if (existingIndexes.includes(SUPPORT_TICKETS_USER_STATUS_INDEX)) {
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
