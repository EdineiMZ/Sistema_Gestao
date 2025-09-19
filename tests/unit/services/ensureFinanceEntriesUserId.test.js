const { Sequelize, DataTypes, QueryTypes } = require('sequelize');
const { ensureFinanceEntriesUserId } = require('../../../src/services/ensureFinanceEntriesUserId');

const buildModels = async () => {
    const sequelize = new Sequelize('sqlite::memory:', { logging: false });
    await sequelize.query('PRAGMA foreign_keys = OFF;');

    const queryInterface = sequelize.getQueryInterface();

    await queryInterface.createTable('Users', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: DataTypes.STRING },
        role: { type: DataTypes.STRING },
        createdAt: { type: DataTypes.DATE },
        updatedAt: { type: DataTypes.DATE }
    });

    await queryInterface.createTable('FinanceEntries', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        userId: { type: DataTypes.INTEGER, allowNull: true },
        description: { type: DataTypes.STRING },
        type: { type: DataTypes.STRING },
        value: { type: DataTypes.DECIMAL(10, 2) },
        dueDate: { type: DataTypes.DATEONLY },
        createdAt: { type: DataTypes.DATE },
        updatedAt: { type: DataTypes.DATE }
    });

    const User = sequelize.define('User', {
        name: DataTypes.STRING,
        role: DataTypes.STRING
    }, {
        tableName: 'Users',
        timestamps: true
    });

    const FinanceEntry = sequelize.define('FinanceEntry', {
        userId: { type: DataTypes.INTEGER, allowNull: false },
        description: DataTypes.STRING,
        type: DataTypes.STRING,
        value: DataTypes.DECIMAL(10, 2),
        dueDate: DataTypes.DATEONLY
    }, {
        tableName: 'FinanceEntries',
        timestamps: true
    });

    return { sequelize, User, FinanceEntry };
};

describe('ensureFinanceEntriesUserId', () => {
    it('prefers admin fallback and allows sync to succeed after cleanup', async () => {
        const { sequelize, User, FinanceEntry } = await buildModels();
        const queryInterface = sequelize.getQueryInterface();

        try {
            const createdAtClient = new Date('2024-01-01T00:00:00Z');
            const createdAtAdmin = new Date('2024-02-01T00:00:00Z');

            await queryInterface.bulkInsert('Users', [
                { id: 1, name: 'Legacy Client', role: 'client', createdAt: createdAtClient, updatedAt: createdAtClient },
                { id: 2, name: 'Legacy Admin', role: 'admin', createdAt: createdAtAdmin, updatedAt: createdAtAdmin }
            ]);

            const createdAtEntry = new Date('2024-03-01T00:00:00Z');
            await queryInterface.bulkInsert('FinanceEntries', [
                {
                    id: 10,
                    description: 'Orphan payable',
                    type: 'payable',
                    value: '150.00',
                    dueDate: '2024-03-10',
                    userId: null,
                    createdAt: createdAtEntry,
                    updatedAt: createdAtEntry
                }
            ]);

            const result = await ensureFinanceEntriesUserId({ sequelize, User, FinanceEntry, logger: null });
            expect(result).toMatchObject({ updatedRows: 1, fallbackUserId: 2 });

            const rows = await queryInterface.sequelize.query(
                'SELECT "userId" FROM "FinanceEntries" WHERE "id" = 10',
                { type: QueryTypes.SELECT }
            );
            expect(rows[0].userId).toBe(2);

            await expect(sequelize.sync({ alter: true })).resolves.toBeDefined();
        } finally {
            await sequelize.close();
        }
    });

    it('falls back to the oldest user when no admin exists', async () => {
        const { sequelize, User, FinanceEntry } = await buildModels();
        const queryInterface = sequelize.getQueryInterface();

        try {
            const createdAtFirst = new Date('2024-01-01T00:00:00Z');
            const createdAtSecond = new Date('2024-02-01T00:00:00Z');

            await queryInterface.bulkInsert('Users', [
                { id: 1, name: 'First User', role: 'manager', createdAt: createdAtFirst, updatedAt: createdAtFirst },
                { id: 2, name: 'Second User', role: 'client', createdAt: createdAtSecond, updatedAt: createdAtSecond }
            ]);

            const createdAtEntry = new Date('2024-03-01T00:00:00Z');
            await queryInterface.bulkInsert('FinanceEntries', [
                {
                    id: 20,
                    description: 'Legacy receivable',
                    type: 'receivable',
                    value: '200.00',
                    dueDate: '2024-04-01',
                    userId: null,
                    createdAt: createdAtEntry,
                    updatedAt: createdAtEntry
                }
            ]);

            const result = await ensureFinanceEntriesUserId({ sequelize, User, FinanceEntry, logger: null });
            expect(result).toMatchObject({ updatedRows: 1, fallbackUserId: 1 });

            const rows = await queryInterface.sequelize.query(
                'SELECT "userId" FROM "FinanceEntries" WHERE "id" = 20',
                { type: QueryTypes.SELECT }
            );
            expect(rows[0].userId).toBe(1);
        } finally {
            await sequelize.close();
        }
    });

    it('throws a descriptive error when no users exist', async () => {
        const { sequelize, User, FinanceEntry } = await buildModels();

        try {
            await expect(
                ensureFinanceEntriesUserId({ sequelize, User, FinanceEntry, logger: null })
            ).rejects.toThrow(/no fallback user/i);
        } finally {
            await sequelize.close();
        }
    });
});
