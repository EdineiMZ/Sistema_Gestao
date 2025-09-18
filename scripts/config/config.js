require('dotenv').config();

const toNumber = (value, fallback) => {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const buildPoolConfig = () => ({
    max: toNumber(process.env.DB_POOL_MAX, 5),
    min: toNumber(process.env.DB_POOL_MIN, 0),
    acquire: toNumber(process.env.DB_POOL_ACQUIRE, 30000),
    idle: toNumber(process.env.DB_POOL_IDLE, 10000)
});

const buildBaseRelationalConfig = (suffix = '') => {
    const dialect = (process.env.DB_DIALECT || 'postgres').toLowerCase();
    const config = {
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASS || 'postgres',
        database: `${process.env.DB_NAME || 'sistema_gestao'}${suffix}`,
        host: process.env.DB_HOST || '127.0.0.1',
        port: toNumber(process.env.DB_PORT, 5432),
        dialect,
        logging: process.env.DB_LOGGING === 'true',
        define: {
            underscored: false,
            freezeTableName: false
        },
        pool: buildPoolConfig()
    };

    if (process.env.DB_SSL === 'true') {
        config.dialectOptions = {
            ssl: {
                require: true,
                rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
            }
        };
    }

    return config;
};

const buildSqliteConfig = () => ({
    dialect: 'sqlite',
    storage: process.env.DB_STORAGE || ':memory:',
    logging: false,
    define: {
        underscored: false,
        freezeTableName: false
    },
    pool: {
        max: 1,
        min: 0,
        acquire: 30000,
        idle: 10000
    }
});

const requestedDialect = (process.env.DB_DIALECT || '').toLowerCase();
const useSqlite = requestedDialect === 'sqlite';

module.exports = {
    development: useSqlite ? buildSqliteConfig() : buildBaseRelationalConfig(),
    test: buildSqliteConfig(),
    production: buildBaseRelationalConfig()
};
