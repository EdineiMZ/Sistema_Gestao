'use strict';

const TICKET_TABLE_CANDIDATES = Object.freeze(['supportTickets', 'SupportTickets']);
const USER_TABLE = 'Users';

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
        /não existe/i.test(message);
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

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tableName = await resolveExistingTableName(queryInterface, TICKET_TABLE_CANDIDATES);
        if (!tableName) return;

        // Criar colunas se não existirem
        await queryInterface.addColumn(tableName, 'creatorId', {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
                model: USER_TABLE,
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
        });

        await queryInterface.addColumn(tableName, 'assignedToId', {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
                model: USER_TABLE,
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
        });

        await queryInterface.addColumn(tableName, 'lastMessageAt', {
            type: Sequelize.DATE,
            allowNull: true
        });

        await queryInterface.addColumn(tableName, 'firstResponseAt', {
            type: Sequelize.DATE,
            allowNull: true
        });

        await queryInterface.addColumn(tableName, 'resolvedAt', {
            type: Sequelize.DATE,
            allowNull: true
        });

        // Criar índices
        await queryInterface.addIndex(tableName, {
            name: NEW_STATUS_INDEX,
            fields: ['creatorId', 'status']
        });

        await queryInterface.addIndex(tableName, {
            name: ASSIGNEE_STATUS_INDEX,
            fields: ['assignedToId', 'status']
        });
    },

    down: async (queryInterface, Sequelize) => {
        const tableName = await resolveExistingTableName(queryInterface, TICKET_TABLE_CANDIDATES);
        if (!tableName) return;

        // Remover índices
        await queryInterface.removeIndex(tableName, NEW_STATUS_INDEX);
        await queryInterface.removeIndex(tableName, ASSIGNEE_STATUS_INDEX);

        // Remover colunas
        await queryInterface.removeColumn(tableName, 'creatorId');
        await queryInterface.removeColumn(tableName, 'assignedToId');
        await queryInterface.removeColumn(tableName, 'lastMessageAt');
        await queryInterface.removeColumn(tableName, 'firstResponseAt');
        await queryInterface.removeColumn(tableName, 'resolvedAt');
    }
};
