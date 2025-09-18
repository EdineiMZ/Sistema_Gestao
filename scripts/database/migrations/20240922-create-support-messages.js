'use strict';

const DEFAULT_TABLE_NAME = 'supportMessages';
const MESSAGE_TABLE_CANDIDATES = Object.freeze(['supportMessages', 'SupportMessages']);
const TICKET_TABLE_CANDIDATES = Object.freeze(['supportTickets', 'SupportTickets']);
const MESSAGE_TICKET_INDEX = 'supportMessages_ticketId_createdAt';
const MESSAGE_SENDER_INDEX = 'supportMessages_senderId_idx';
const MESSAGE_ATTACHMENT_INDEX = 'supportMessages_attachmentId_idx';

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
        const ticketTableName = await resolveExistingTableName(
            queryInterface,
            TICKET_TABLE_CANDIDATES
        ) ?? TICKET_TABLE_CANDIDATES[0];

        const targetTableName = await resolveExistingTableName(
            queryInterface,
            MESSAGE_TABLE_CANDIDATES
        ) ?? DEFAULT_TABLE_NAME;

        if (!(await tableExists(queryInterface, targetTableName))) {
            await queryInterface.createTable(targetTableName, {
                id: {
                    type: Sequelize.INTEGER,
                    primaryKey: true,
                    autoIncrement: true
                },
                ticketId: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: {
                    model: ticketTableName,
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
            senderRole: {
                type: Sequelize.STRING(20),
                allowNull: false
            },
            messageType: {
                type: Sequelize.STRING(20),
                allowNull: false,
                defaultValue: 'text'
            },
            content: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            attachmentId: {
                type: Sequelize.INTEGER,
                allowNull: true
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

        if (!existingIndexes.includes(MESSAGE_TICKET_INDEX)) {
            await queryInterface.addIndex(targetTableName, {
                name: MESSAGE_TICKET_INDEX,
                fields: ['ticketId', 'createdAt']
            });
        }

        if (!existingIndexes.includes(MESSAGE_SENDER_INDEX)) {
            await queryInterface.addIndex(targetTableName, {
                name: MESSAGE_SENDER_INDEX,
                fields: ['senderId']
            });
        }

        if (!existingIndexes.includes(MESSAGE_ATTACHMENT_INDEX)) {
            await queryInterface.addIndex(targetTableName, {
                name: MESSAGE_ATTACHMENT_INDEX,
                fields: ['attachmentId']
            });
        }
    },

    down: async (queryInterface) => {
        const targetTableName = await resolveExistingTableName(
            queryInterface,
            MESSAGE_TABLE_CANDIDATES
        );

        if (!targetTableName) {
            return;
        }

        const existingIndexes = await getIndexNames(queryInterface, targetTableName);

        if (existingIndexes.includes(MESSAGE_ATTACHMENT_INDEX)) {
            await queryInterface.removeIndex(
                targetTableName,
                MESSAGE_ATTACHMENT_INDEX
            );
        }

        if (existingIndexes.includes(MESSAGE_SENDER_INDEX)) {
            await queryInterface.removeIndex(
                targetTableName,
                MESSAGE_SENDER_INDEX
            );
        }

        if (existingIndexes.includes(MESSAGE_TICKET_INDEX)) {
            await queryInterface.removeIndex(
                targetTableName,
                MESSAGE_TICKET_INDEX
            );
        }

        if (await tableExists(queryInterface, targetTableName)) {
            await queryInterface.dropTable(targetTableName);
        }
    }
};
