#!/usr/bin/env node
require('dotenv').config();

const path = require('path');
const { Umzug, SequelizeStorage } = require('umzug');
const { sequelize } = require('../database/models');

const createMigrator = () => {
    const migrationsPath = path.join(__dirname, '..', 'database', 'migrations', '*.js');
    const queryInterface = sequelize.getQueryInterface();

    return new Umzug({
        context: queryInterface,
        storage: new SequelizeStorage({ sequelize }),
        migrations: {
            glob: migrationsPath,
            resolve: ({ name, path: migrationPath }) => {
                const migration = require(migrationPath);

                return {
                    name,
                    up: async () => {
                        if (typeof migration.up === 'function') {
                            await migration.up(queryInterface, sequelize.Sequelize);
                        }
                    },
                    down: async () => {
                        if (typeof migration.down === 'function') {
                            await migration.down(queryInterface, sequelize.Sequelize);
                        }
                    }
                };
            }
        },
        logger: console
    });
};

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
        /no description found/i.test(message) ||
        /não existe/i.test(message);
};

const shouldAllowSyncFallback = () => {
    if ((process.env.NODE_ENV || '').trim().toLowerCase() === 'production') {
        return false;
    }

    const rawValue = (process.env.ALLOW_SCHEMA_SYNC_FALLBACK || '').trim().toLowerCase();
    if (!rawValue) {
        return true;
    }

    return ['1', 'true', 'yes', 'on', 'enabled'].includes(rawValue);
};

const ensureBaseSchema = async () => {
    const queryInterface = sequelize.getQueryInterface();

    try {
        await queryInterface.describeTable('Users');
        return false;
    } catch (error) {
        if (!isTableMissingError(error)) {
            throw error;
        }
    }

    if (!shouldAllowSyncFallback()) {
        throw new Error('Tabela Users ausente após migrations e fallback com sequelize.sync() desativado.');
    }

    console.warn('Tabela Users ausente; executando fallback com sequelize.sync() (ambiente não produtivo).');

    await sequelize.sync();
    return true;
};

const extractRootError = (error) => {
    if (!error) {
        return null;
    }

    return error.cause || error.original || error.parent || error;
};

const isIgnorableMigrationError = (error) => {
    const rootError = extractRootError(error);
    const code = rootError?.code || rootError?.original?.code;
    const errno = rootError?.errno || rootError?.original?.errno;
    const message = [
        error?.message,
        rootError?.message
    ].filter(Boolean).join(' ') || '';

    return code === 'ER_DUP_FIELDNAME' ||
        code === 'ER_DUP_KEYNAME' ||
        code === 'ER_DUP_ENTRY' ||
        code === 'SQLITE_CONSTRAINT' ||
        errno === 1060 ||
        errno === 1061 ||
        errno === 1 && /duplicate column/i.test(message) ||
        /duplicate column/i.test(message) ||
        /no such column\s*:\s*userid/i.test(message) ||
        /near \"do\"/i.test(message) ||
        /already exists/i.test(message);
};

const runMigrations = async ({ skipConflicts = false } = {}) => {
    const migrator = createMigrator();

    if (!skipConflicts) {
        await migrator.up();
        return;
    }

    const pending = await migrator.pending();

    for (const migration of pending) {
        try {
            await migrator.up({ migrations: [migration.name] });
        } catch (error) {
            if (isIgnorableMigrationError(error)) {
                console.warn(`Ignorando migração já aplicada (${migration.name}): ${error.message}`);
                if (typeof migrator.storage?.logMigration === 'function') {
                    await migrator.storage.logMigration({ name: migration.name });
                }
                continue;
            }

            throw error;
        }
    }
};

const run = async () => {
    let fallbackExecuted = false;

    try {
        await sequelize.authenticate();
        fallbackExecuted = await ensureBaseSchema();
        await runMigrations({ skipConflicts: fallbackExecuted });
        await ensureBaseSchema();
        console.log('Migrations executadas com sucesso.');
    } catch (error) {
        console.error('Falha ao executar as migrations:', error);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
};

run();
