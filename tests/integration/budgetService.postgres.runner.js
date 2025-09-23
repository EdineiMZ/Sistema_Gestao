process.env.NODE_ENV = 'test';

const { newDb } = require('pg-mem');
const Module = require('module');

const run = async () => {
    const { Sequelize, DataTypes } = require('sequelize');

    const db = newDb({ autoCreateForeignKeyIndices: true });
    const pgMem = db.adapters.createPg();

    const registerFunctions = () => {
        db.public.registerFunction({
            name: 'to_char',
            args: ['date', 'text'],
            returns: 'text',
            implementation: (value, format) => {
                const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
                if (Number.isNaN(date.getTime())) {
                    return null;
                }
                const year = String(date.getUTCFullYear()).padStart(4, '0');
                const month = String(date.getUTCMonth() + 1).padStart(2, '0');
                const day = String(date.getUTCDate()).padStart(2, '0');
                if (format === 'YYYY-MM') {
                    return `${year}-${month}`;
                }
                if (format === 'YYYY-MM-DD') {
                    return `${year}-${month}-${day}`;
                }
                return `${year}-${month}-${day}`;
            }
        });

        db.public.registerFunction({
            name: 'date_trunc',
            args: ['text', 'date'],
            returns: 'date',
            implementation: (unit, value) => {
                const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
                if (Number.isNaN(date.getTime())) {
                    return null;
                }
                if (typeof unit === 'string' && unit.toLowerCase() === 'month') {
                    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
                }
                return date;
            }
        });
    };

    registerFunctions();

    const sequelize = new Sequelize('postgres://user:pass@localhost:5432/db', {
        dialect: 'postgres',
        logging: false,
        dialectModule: pgMem
    });

    const FinanceCategory = sequelize.define('FinanceCategory', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        name: { type: DataTypes.STRING, allowNull: false },
        slug: { type: DataTypes.STRING, allowNull: false },
        color: { type: DataTypes.STRING, allowNull: false }
    }, {
        tableName: 'FinanceCategories',
        timestamps: false
    });
    FinanceCategory.addScope('all', { where: {} });

    const Budget = sequelize.define('Budget', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        monthlyLimit: { type: DataTypes.DOUBLE, allowNull: false },
        thresholds: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
        referenceMonth: { type: DataTypes.DATEONLY, allowNull: true },
        userId: { type: DataTypes.INTEGER, allowNull: false },
        financeCategoryId: { type: DataTypes.INTEGER, allowNull: false }
    }, {
        tableName: 'Budgets',
        timestamps: false
    });

    const FinanceEntry = sequelize.define('FinanceEntry', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        userId: { type: DataTypes.INTEGER, allowNull: false },
        description: { type: DataTypes.STRING, allowNull: false },
        type: { type: DataTypes.STRING, allowNull: false },
        value: { type: DataTypes.DOUBLE, allowNull: false },
        dueDate: { type: DataTypes.DATEONLY, allowNull: false },
        status: { type: DataTypes.STRING, allowNull: false },
        financeCategoryId: { type: DataTypes.INTEGER, allowNull: true }
    }, {
        tableName: 'FinanceEntries',
        timestamps: false
    });

    FinanceCategory.hasMany(Budget, { as: 'budgets', foreignKey: 'financeCategoryId' });
    Budget.belongsTo(FinanceCategory, { as: 'category', foreignKey: 'financeCategoryId' });
    FinanceCategory.hasMany(FinanceEntry, { as: 'entries', foreignKey: 'financeCategoryId' });
    FinanceEntry.belongsTo(FinanceCategory, { as: 'category', foreignKey: 'financeCategoryId' });

    await sequelize.sync({ force: true });

    const modelsModulePath = require.resolve('../../database/models');
    const stubModule = new Module(modelsModulePath);
    stubModule.filename = modelsModulePath;
    stubModule.exports = {
        FinanceEntry,
        FinanceGoal: null,
        Budget,
        FinanceCategory,
        Sequelize,
        sequelize
    };
    stubModule.loaded = true;
    require.cache[modelsModulePath] = stubModule;

    const budgetServicePath = require.resolve('../../src/services/budgetService');
    delete require.cache[budgetServicePath];
    const budgetService = require(budgetServicePath);

    const category = await FinanceCategory.create({
        name: 'Serviços',
        slug: 'servicos',
        color: '#3366ff'
    });

    await Budget.create({
        monthlyLimit: 1000,
        thresholds: [0.5, 0.75, 0.9],
        referenceMonth: '2024-01-01',
        userId: 321,
        financeCategoryId: category.id
    });

    await FinanceEntry.bulkCreate([
        {
            userId: 321,
            description: 'Conta de luz',
            type: 'payable',
            value: 250,
            dueDate: '2024-01-15',
            status: 'paid',
            financeCategoryId: category.id
        },
        {
            userId: 321,
            description: 'Conta de água',
            type: 'payable',
            value: 150,
            dueDate: '2024-01-20',
            status: 'paid',
            financeCategoryId: category.id
        }
    ]);

    const overview = await budgetService.getBudgetOverview({ userId: 321 });

    const januarySummary = overview.summaries.find((item) => item.categoryId === category.id && item.month === '2024-01');
    if (!januarySummary || Math.abs(januarySummary.consumption - 400) > 0.001) {
        throw new Error('Postgres budget overview validation failed.');
    }

    await sequelize.close();
};

run()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
