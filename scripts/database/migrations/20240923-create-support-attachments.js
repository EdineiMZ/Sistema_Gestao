'use strict';

const DEFAULT_TABLE_NAME = 'supportAttachments';
const ATTACHMENT_TABLE_CANDIDATES = Object.freeze(['supportAttachments', 'SupportAttachments']);
const MESSAGE_TABLE_CANDIDATES = Object.freeze(['supportMessages', 'SupportMessages']);
const TICKET_TABLE_CANDIDATES = Object.freeze(['supportTickets', 'SupportTickets']);
const ATTACHMENT_TICKET_INDEX = 'supportAttachments_ticketId_idx';
const ATTACHMENT_UPLOADER_INDEX = 'supportAttachments_uploaderId_idx';
const MESSAGE_ATTACHMENT_CONSTRAINT = 'supportMessages_attachmentId_fkey';

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

const hasConstraint = (constraints, targetName) => {
    return constraints.some((constraint) => {
        const constraintName = constraint?.constraintName ?? constraint?.constraint_name;
        return constraintName === targetName;
    });
};

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const ticketTableName = await resolveExistingTableName(
            queryInterface,
            TICKET_TABLE_CANDIDATES
        ) ?? TICKET_TABLE_CANDIDATES[0];

        const targetTableName = await resolveExistingTableName(
            queryInterface,
            ATTACHMENT_TABLE_CANDIDATES
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
            uploadedById: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'Users',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            },
            originalName: {
                type: Sequelize.STRING(255),
                allowNull: false
            },
            storageKey: {
                type: Sequelize.STRING(255),
                allowNull: false
            },
            checksum: {
                type: Sequelize.STRING(64),
                allowNull: false
            },
            mimeType: {
                type: Sequelize.STRING(120),
                allowNull: false
            },
            size: {
                type: Sequelize.BIGINT,
                allowNull: false
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

        if (!existingIndexes.includes(ATTACHMENT_TICKET_INDEX)) {
            await queryInterface.addIndex(targetTableName, {
                name: ATTACHMENT_TICKET_INDEX,
                fields: ['ticketId']
            });
        }

        if (!existingIndexes.includes(ATTACHMENT_UPLOADER_INDEX)) {
            await queryInterface.addIndex(targetTableName, {
                name: ATTACHMENT_UPLOADER_INDEX,
                fields: ['uploadedById']
            });
        }

        const messageTableName = await resolveExistingTableName(
            queryInterface,
            MESSAGE_TABLE_CANDIDATES
        );

        if (messageTableName && await tableExists(queryInterface, messageTableName)) {
            const constraints = await queryInterface.getForeignKeyReferencesForTable(messageTableName);

            if (!hasConstraint(constraints, MESSAGE_ATTACHMENT_CONSTRAINT)) {
                await queryInterface.addConstraint(messageTableName, {
                    fields: ['attachmentId'],
                    type: 'foreign key',
                    name: MESSAGE_ATTACHMENT_CONSTRAINT,
                    references: {
                        table: targetTableName,
                        field: 'id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'SET NULL'
                });
            }
        }
    },

    down: async (queryInterface) => {
        const targetTableName = await resolveExistingTableName(
            queryInterface,
            ATTACHMENT_TABLE_CANDIDATES
        );

        const messageTableName = await resolveExistingTableName(
            queryInterface,
            MESSAGE_TABLE_CANDIDATES
        );

        if (messageTableName && await tableExists(queryInterface, messageTableName)) {
            try {
                const constraints = await queryInterface.getForeignKeyReferencesForTable(messageTableName);
                if (hasConstraint(constraints, MESSAGE_ATTACHMENT_CONSTRAINT)) {
                    await queryInterface.removeConstraint(
                        messageTableName,
                        MESSAGE_ATTACHMENT_CONSTRAINT
                    );
                }
            } catch (error) {
                if (!isTableMissingError(error)) {
                    throw error;
                }
            }
        }

        if (!targetTableName) {
            return;
        }

        const existingIndexes = await getIndexNames(queryInterface, targetTableName);

        if (existingIndexes.includes(ATTACHMENT_UPLOADER_INDEX)) {
            await queryInterface.removeIndex(
                targetTableName,
                ATTACHMENT_UPLOADER_INDEX
            );
        }

        if (existingIndexes.includes(ATTACHMENT_TICKET_INDEX)) {
            await queryInterface.removeIndex(
                targetTableName,
                ATTACHMENT_TICKET_INDEX
            );
        }

        if (await tableExists(queryInterface, targetTableName)) {
            await queryInterface.dropTable(targetTableName);
        }
    }
};
