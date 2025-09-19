process.env.NODE_ENV = 'test';

const { Sequelize } = require('sequelize');
const migration = require('../../../database/migrations/20240924-rename-support-tables');

const createMissingTableError = (tableName) => {
    const error = new Error(`relation "${tableName}" does not exist`);
    error.original = { code: '42P01', message: error.message };
    error.parent = { code: '42P01', message: error.message };
    return error;
};

const createTableDefinitions = () => ({
    SupportTickets: {
        id: {},
        status: {}
    },
    supportTickets: {
        id: {},
        status: {}
    },
    SupportMessages: {
        id: {},
        ticketId: {}
    },
    supportMessages: {
        id: {},
        ticketId: {}
    },
    SupportAttachments: {
        id: {},
        ticketId: {},
        messageId: {}
    },
    supportAttachments: {
        id: {},
        ticketId: {},
        messageId: {}
    }
});

const buildQueryInterfaceMock = (tableDefinitions) => {
    const transaction = {
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined)
    };

    const describeTable = jest.fn(async (tableName) => {
        const definition = tableDefinitions[tableName];
        if (!definition) {
            throw createMissingTableError(tableName);
        }
        return definition;
    });

    const renameTable = jest.fn().mockResolvedValue(undefined);
    const changeColumn = jest.fn().mockResolvedValue(undefined);

    const sequelize = {
        transaction: jest.fn().mockResolvedValue(transaction),
        getDialect: jest.fn().mockReturnValue('postgres'),
        query: jest.fn().mockResolvedValue(undefined)
    };

    return {
        queryInterface: {
            sequelize,
            describeTable,
            renameTable,
            changeColumn
        },
        transaction,
        describeTable,
        renameTable,
        changeColumn,
        sequelize
    };
};

describe('20240924-rename-support-tables migration', () => {
    it('skips renames in the up migration when camelCase tables already exist', async () => {
        const tableDefinitions = createTableDefinitions();
        const {
            queryInterface,
            transaction,
            renameTable,
            describeTable,
            sequelize
        } = buildQueryInterfaceMock(tableDefinitions);

        await expect(migration.up(queryInterface, Sequelize)).resolves.toBeUndefined();

        expect(describeTable).toHaveBeenCalledWith('SupportTickets', expect.objectContaining({ transaction: expect.any(Object) }));
        expect(describeTable).toHaveBeenCalledWith('supportTickets', expect.objectContaining({ transaction: expect.any(Object) }));
        expect(renameTable).not.toHaveBeenCalledWith('SupportTickets', 'supportTickets', expect.any(Object));
        expect(renameTable).not.toHaveBeenCalledWith('SupportMessages', 'supportMessages', expect.any(Object));
        expect(renameTable).not.toHaveBeenCalledWith('SupportAttachments', 'supportAttachments', expect.any(Object));
        expect(sequelize.query).not.toHaveBeenCalled();
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(transaction.rollback).not.toHaveBeenCalled();
    });

    it('skips renames in the down migration when PascalCase tables already exist', async () => {
        const tableDefinitions = createTableDefinitions();
        const {
            queryInterface,
            transaction,
            renameTable,
            describeTable,
            sequelize
        } = buildQueryInterfaceMock(tableDefinitions);

        await expect(migration.down(queryInterface, Sequelize)).resolves.toBeUndefined();

        expect(describeTable).toHaveBeenCalledWith('supportTickets', expect.objectContaining({ transaction: expect.any(Object) }));
        expect(describeTable).toHaveBeenCalledWith('SupportTickets', expect.objectContaining({ transaction: expect.any(Object) }));
        expect(renameTable).not.toHaveBeenCalledWith('supportTickets', 'SupportTickets', expect.any(Object));
        expect(renameTable).not.toHaveBeenCalledWith('supportMessages', 'SupportMessages', expect.any(Object));
        expect(renameTable).not.toHaveBeenCalledWith('supportAttachments', 'SupportAttachments', expect.any(Object));
        expect(sequelize.query).not.toHaveBeenCalled();
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(transaction.rollback).not.toHaveBeenCalled();
    });
});

