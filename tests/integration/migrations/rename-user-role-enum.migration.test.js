process.env.NODE_ENV = 'test';

const { newDb } = require('pg-mem');
const { Sequelize } = require('sequelize');
const migration = require('../../../database/migrations/20240928-rename-user-role-enum');

const buildDatabase = () => {
    const db = newDb({ autoCreateForeignKeyIndices: true });
    const pgMem = db.adapters.createPg();
    const sequelize = new Sequelize('postgres://user:pass@localhost:5432/db', {
        dialect: 'postgres',
        logging: false,
        dialectModule: pgMem
    });

    const originalQuery = sequelize.query.bind(sequelize);

    const enumExists = async (typeName) => {
        try {
            await originalQuery(`SELECT NULL::"${typeName}";`);
            return true;
        } catch (error) {
            return false;
        }
    };

    sequelize.query = async (sql, options = {}) => {
        const normalizedSql = typeof sql === 'string' ? sql : '';
        const replacementName = options?.replacements?.typeName;

        let typeName = replacementName;
        if (!typeName && normalizedSql.includes('FROM pg_type')) {
            const literalMatch = normalizedSql.match(/typname\s*=\s*'?"?([A-Za-z0-9_\"]+)"?'?/i);
            if (literalMatch) {
                typeName = literalMatch[1].replace(/"/g, '');
            }
        }

        if (typeName && normalizedSql.includes('FROM pg_type')) {
            const exists = await enumExists(typeName);
            return [[{ exists }], undefined];
        }

        return originalQuery(sql, options);
    };

    return { sequelize, queryInterface: sequelize.getQueryInterface() };
};

describe('20240928-rename-user-role-enum migration', () => {
    it('skips the rename when Users.role already uses the new enum', async () => {
        const { sequelize, queryInterface } = buildDatabase();

        try {
            await sequelize.query(`CREATE TYPE "enum_Users_role" AS ENUM ('admin', 'client');`);
            await sequelize.query(`CREATE TABLE "Users" (id SERIAL PRIMARY KEY, role "enum_Users_role" NOT NULL);`);
            await sequelize.query(`INSERT INTO "Users" (role) VALUES ('client');`);

            await migration.up(queryInterface);

            const [[typeExists]] = await sequelize.query(`
                SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_Users_role') AS exists;
            `);
            expect(typeExists.exists).toBe(true);

            const [[row]] = await sequelize.query(`SELECT role::text AS role FROM "Users";`);
            expect(row.role).toBe('client');

            await expect(sequelize.query('SELECT NULL::"enum_Users_role";')).resolves.toBeDefined();
            await expect(sequelize.query('SELECT NULL::"user_role_enum";')).rejects.toThrow();
        } finally {
            await sequelize.close();
        }
    });

    it('drops conflicting enum and renames the old enum when Users.role still references user_role_enum', async () => {
        const { sequelize, queryInterface } = buildDatabase();

        try {
            await sequelize.query(`CREATE TYPE "user_role_enum" AS ENUM ('admin', 'client');`);
            await sequelize.query(`CREATE TYPE "enum_Users_role" AS ENUM ('admin', 'client');`);
            await sequelize.query(`CREATE TABLE "Users" (id SERIAL PRIMARY KEY, role "user_role_enum" NOT NULL);`);
            await sequelize.query(`INSERT INTO "Users" (role) VALUES ('admin'), ('client');`);

            await migration.up(queryInterface);

            const [[newTypeExists]] = await sequelize.query(`
                SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_Users_role') AS exists;
            `);
            expect(newTypeExists.exists).toBe(true);

            const [[oldTypeExists]] = await sequelize.query(`
                SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum') AS exists;
            `);
            expect(oldTypeExists.exists).toBe(false);

            const [rows] = await sequelize.query(`SELECT role::text AS role FROM "Users" ORDER BY id;`);
            expect(rows).toEqual([
                { role: 'admin' },
                { role: 'client' }
            ]);

            await expect(sequelize.query('SELECT NULL::"enum_Users_role";')).resolves.toBeDefined();
            await expect(sequelize.query('SELECT NULL::"user_role_enum";')).rejects.toThrow();
        } finally {
            await sequelize.close();
        }
    });
});
