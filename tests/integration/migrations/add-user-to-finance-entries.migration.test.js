process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

const { Sequelize, DataTypes } = require('sequelize');
const migration = require('../../../database/migrations/20240927-add-user-to-finance-entries');

const buildBaseSchema = async () => {
    const sequelize = new Sequelize('sqlite::memory:', { logging: false });
    await sequelize.query('PRAGMA foreign_keys = ON;');
    const queryInterface = sequelize.getQueryInterface();

    await queryInterface.createTable('Users', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        role: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'client'
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: false
        }
    });

    await queryInterface.createTable('FinanceEntries', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        description: {
            type: DataTypes.STRING,
            allowNull: true
        },
        type: {
            type: DataTypes.STRING,
            allowNull: true
        },
        value: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true
        },
        dueDate: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        financeCategoryId: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: false
        }
    });

    return { sequelize, queryInterface };
};

const defineSyncModels = (sequelizeInstance) => {
    const UserModel = sequelizeInstance.define('User', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        role: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'client'
        }
    }, {
        tableName: 'Users',
        timestamps: true
    });

    const FinanceEntryModel = sequelizeInstance.define('FinanceEntry', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        description: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: ''
        },
        type: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'payable'
        },
        value: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: '0'
        },
        dueDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            defaultValue: '1970-01-01'
        },
        financeCategoryId: {
            type: DataTypes.INTEGER,
            allowNull: true
        }
    }, {
        tableName: 'FinanceEntries',
        timestamps: true
    });

    FinanceEntryModel.belongsTo(UserModel, { foreignKey: 'userId' });

    return { UserModel, FinanceEntryModel };
};

describe('20240927-add-user-to-finance-entries migration', () => {
    it('backfills existing rows with the best fallback user and keeps schema in sync', async () => {
        const { sequelize, queryInterface } = await buildBaseSchema();

        try {
            const clientCreatedAt = new Date('2024-01-01T00:00:00Z');
            const adminCreatedAt = new Date('2024-02-01T00:00:00Z');
            await queryInterface.bulkInsert('Users', [
                { id: 1, name: 'Regular User', role: 'client', createdAt: clientCreatedAt, updatedAt: clientCreatedAt },
                { id: 2, name: 'Admin User', role: 'admin', createdAt: adminCreatedAt, updatedAt: adminCreatedAt }
            ]);

            const entryCreatedAt = new Date('2024-03-01T00:00:00Z');
            await queryInterface.bulkInsert('FinanceEntries', [
                {
                    id: 10,
                    description: 'Legacy entry',
                    type: 'payable',
                    value: '100.00',
                    dueDate: '2024-03-10',
                    financeCategoryId: null,
                    createdAt: entryCreatedAt,
                    updatedAt: entryCreatedAt
                }
            ]);

            await migration.up(queryInterface, Sequelize);

            const rows = await queryInterface.sequelize.query(
                'SELECT "userId" FROM "FinanceEntries" WHERE "id" = 10',
                { type: Sequelize.QueryTypes.SELECT }
            );

            expect(rows[0].userId).toBe(2);

            const tableDefinition = await queryInterface.describeTable('FinanceEntries');
            expect(tableDefinition.userId.allowNull).toBe(false);

            defineSyncModels(sequelize);

            await expect(sequelize.sync()).resolves.toBeDefined();
        } finally {
            await sequelize.close();
        }
    });

    it('throws a descriptive error when no fallback user exists', async () => {
        const { sequelize, queryInterface } = await buildBaseSchema();

        try {
            const entryCreatedAt = new Date('2024-03-01T00:00:00Z');
            await queryInterface.bulkInsert('FinanceEntries', [
                {
                    id: 20,
                    description: 'Orphan entry',
                    type: 'payable',
                    value: '200.00',
                    dueDate: '2024-03-15',
                    financeCategoryId: null,
                    createdAt: entryCreatedAt,
                    updatedAt: entryCreatedAt
                }
            ]);

            await expect(migration.up(queryInterface, Sequelize)).rejects.toThrow(
                /no fallback user found/i
            );
        } finally {
            await sequelize.close();
        }
    });
});
