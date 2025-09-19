'use strict';

const ATTACHMENT_TABLE_CANDIDATES = Object.freeze(['supportAttachments', 'SupportAttachments']);
const MESSAGE_TABLE_CANDIDATES = Object.freeze(['supportMessages', 'SupportMessages']);
const MESSAGE_ID_INDEX = 'supportAttachments_messageId_idx';

const isTableMissingError = (error) => {
    const driverCode = error?.original?.code || error?.parent?.code;
    const message = [
        error?.message,
        error?.original?.message,
        error?.parent?.message
    ].filter(Boolean).join(' ') || '';

    return driverCode === 'ER_NO_SUCH_TABLE' ||
        driverCode === 'SQLITE_ERROR' ||
        /does not exist/i.test(message) ||
        /no such table/i.test(message) ||
        /unknown table/i.test(message) ||
        /no description found/i.test(message);
};

const describeTable = async (queryInterface, tableName) => {
    try {
        return await queryInterface.describeTable(tableName);
    } catch (error) {
        if (isTableMissingError(error)) {
            return null;
        }

        throw error;
    }
};

const resolveExistingTableName = async (queryInterface, candidates) => {
    for (const name of candidates) {
        if (await describeTable(queryInterface, name)) {
            return name;
        }
    }

    return null;
};

const columnExists = async (queryInterface, tableName, columnName) => {
    const definition = await describeTable(queryInterface, tableName);
    return Boolean(definition?.[columnName]);
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
        const attachmentTableName = await resolveExistingTableName(
            queryInterface,
            ATTACHMENT_TABLE_CANDIDATES
        );

        if (!attachmentTableName) {
            return;
        }

        const messageTableName = await resolveExistingTableName(
            queryInterface,
            MESSAGE_TABLE_CANDIDATES
        );

        if (!(await columnExists(queryInterface, attachmentTableName, 'messageId'))) {
            const columnDefinition = {
                type: Sequelize.INTEGER,
                allowNull: true
            };

            if (messageTableName) {
                columnDefinition.references = {
                    model: messageTableName,
                    key: 'id'
                };
                columnDefinition.onUpdate = 'CASCADE';
                columnDefinition.onDelete = 'CASCADE';
            }

            await queryInterface.addColumn(attachmentTableName, 'messageId', columnDefinition);
        }

        if (await columnExists(queryInterface, attachmentTableName, 'originalName') &&
            !(await columnExists(queryInterface, attachmentTableName, 'fileName'))) {
            await queryInterface.renameColumn(attachmentTableName, 'originalName', 'fileName');
        }

        if (await columnExists(queryInterface, attachmentTableName, 'mimeType') &&
            !(await columnExists(queryInterface, attachmentTableName, 'contentType'))) {
            await queryInterface.renameColumn(attachmentTableName, 'mimeType', 'contentType');
        }

        if (await columnExists(queryInterface, attachmentTableName, 'size') &&
            !(await columnExists(queryInterface, attachmentTableName, 'fileSize'))) {
            await queryInterface.renameColumn(attachmentTableName, 'size', 'fileSize');
        }

        const existingIndexes = await getIndexNames(queryInterface, attachmentTableName);
        if (!existingIndexes.includes(MESSAGE_ID_INDEX)) {
            await queryInterface.addIndex(attachmentTableName, {
                fields: ['messageId'],
                name: MESSAGE_ID_INDEX
            });
        }
    },

    down: async (queryInterface, Sequelize) => {
        const attachmentTableName = await resolveExistingTableName(
            queryInterface,
            ATTACHMENT_TABLE_CANDIDATES
        );

        if (!attachmentTableName) {
            return;
        }

        const existingIndexes = await getIndexNames(queryInterface, attachmentTableName);
        if (existingIndexes.includes(MESSAGE_ID_INDEX)) {
            await queryInterface.removeIndex(attachmentTableName, MESSAGE_ID_INDEX);
        }

        if (await columnExists(queryInterface, attachmentTableName, 'fileSize') &&
            !(await columnExists(queryInterface, attachmentTableName, 'size'))) {
            await queryInterface.renameColumn(attachmentTableName, 'fileSize', 'size');
        }

        if (await columnExists(queryInterface, attachmentTableName, 'contentType') &&
            !(await columnExists(queryInterface, attachmentTableName, 'mimeType'))) {
            await queryInterface.renameColumn(attachmentTableName, 'contentType', 'mimeType');
        }

        if (await columnExists(queryInterface, attachmentTableName, 'fileName') &&
            !(await columnExists(queryInterface, attachmentTableName, 'originalName'))) {
            await queryInterface.renameColumn(attachmentTableName, 'fileName', 'originalName');
        }

        if (await columnExists(queryInterface, attachmentTableName, 'messageId')) {
            await queryInterface.removeColumn(attachmentTableName, 'messageId');
        }
    }
};
