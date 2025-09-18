'use strict';

const { ROLE_ORDER } = require('../../src/constants/roles');

const DEFAULT_ROLE = ROLE_ORDER[0];
const ENUM_TYPE_NAME = 'user_role_enum';

const escapeLiteral = (value) => String(value).replace(/'/g, "''");

const buildPostgresEnumValues = () => ROLE_ORDER
    .map((role) => `'${escapeLiteral(role)}'`)
    .join(', ');

const buildPostgresUsingExpression = () => {
    const stringMatches = ROLE_ORDER
        .map((role) => `'${escapeLiteral(role)}'`)
        .join(', ');

    const numericCases = ROLE_ORDER
        .map((role, index) => `            WHEN role::text = '${index}' THEN '${escapeLiteral(role)}'`)
        .join('\n');

    const numericBlock = numericCases ? `\n${numericCases}` : '';

    return `(
        CASE
            WHEN role IS NULL OR trim(role::text) = '' THEN '${escapeLiteral(DEFAULT_ROLE)}'
            WHEN role::text IN (${stringMatches}) THEN role::text${numericBlock}
            ELSE '${escapeLiteral(DEFAULT_ROLE)}'
        END
    )::${ENUM_TYPE_NAME}`;
};

const buildPostgresRevertExpression = () => {
    const cases = ROLE_ORDER
        .map((role, index) => `            WHEN role::text = '${escapeLiteral(role)}' THEN ${index}`)
        .join('\n');

    const caseBlock = cases ? `\n${cases}` : '';

    return `(
        CASE${caseBlock}
            ELSE 0
        END
    )::INTEGER`;
};

const buildSqliteUpdateToStrings = () => {
    const numericCases = ROLE_ORDER
        .map((role, index) => `            WHEN CAST(role AS TEXT) = '${index}' THEN '${escapeLiteral(role)}'`)
        .join('\n');

    const stringMatches = ROLE_ORDER
        .map((role) => `'${escapeLiteral(role)}'`)
        .join(', ');

    const numericBlock = numericCases ? `\n${numericCases}` : '';

    return `UPDATE "Users"
SET role = CASE
            WHEN role IS NULL OR trim(CAST(role AS TEXT)) = '' THEN '${escapeLiteral(DEFAULT_ROLE)}'
            WHEN CAST(role AS TEXT) IN (${stringMatches}) THEN CAST(role AS TEXT)${numericBlock}
            ELSE '${escapeLiteral(DEFAULT_ROLE)}'
        END;`;
};

const buildSqliteUpdateToNumbers = () => {
    const cases = ROLE_ORDER
        .map((role, index) => `            WHEN CAST(role AS TEXT) = '${escapeLiteral(role)}' THEN ${index}`)
        .join('\n');

    const caseBlock = cases ? `\n${cases}` : '';

    return `UPDATE "Users"
SET role = CASE${caseBlock}
            ELSE 0
        END;`;
};

module.exports = {
    async up(queryInterface, Sequelize) {
        const dialect = queryInterface.sequelize.getDialect();

        if (dialect === 'postgres') {
            await queryInterface.sequelize.transaction(async (transaction) => {
                await queryInterface.sequelize.query(
                    `DO $$
                    BEGIN
                        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${escapeLiteral(ENUM_TYPE_NAME)}') THEN
                            CREATE TYPE ${ENUM_TYPE_NAME} AS ENUM (${buildPostgresEnumValues()});
                        END IF;
                    END$$;`,
                    { transaction }
                );

                await queryInterface.sequelize.query(
                    'ALTER TABLE "Users" ALTER COLUMN "role" DROP DEFAULT;',
                    { transaction }
                );

                await queryInterface.sequelize.query(
                    `ALTER TABLE "Users" ALTER COLUMN "role" TYPE ${ENUM_TYPE_NAME} USING ${buildPostgresUsingExpression()};`,
                    { transaction }
                );

                await queryInterface.sequelize.query(
                    `UPDATE "Users" SET "role" = '${escapeLiteral(DEFAULT_ROLE)}'::${ENUM_TYPE_NAME} WHERE "role" IS NULL;`,
                    { transaction }
                );

                await queryInterface.sequelize.query(
                    `ALTER TABLE "Users" ALTER COLUMN "role" SET DEFAULT '${escapeLiteral(DEFAULT_ROLE)}'::${ENUM_TYPE_NAME};`,
                    { transaction }
                );

                await queryInterface.sequelize.query(
                    'ALTER TABLE "Users" ALTER COLUMN "role" SET NOT NULL;',
                    { transaction }
                );
            });
            return;
        }

        await queryInterface.sequelize.transaction(async (transaction) => {
            await queryInterface.sequelize.query(
                buildSqliteUpdateToStrings(),
                { transaction }
            );

            await queryInterface.changeColumn(
                'Users',
                'role',
                {
                    type: Sequelize.STRING(32),
                    allowNull: false,
                    defaultValue: DEFAULT_ROLE,
                },
                { transaction }
            );
        });
    },

    async down(queryInterface, Sequelize) {
        const dialect = queryInterface.sequelize.getDialect();

        if (dialect === 'postgres') {
            await queryInterface.sequelize.transaction(async (transaction) => {
                await queryInterface.sequelize.query(
                    'ALTER TABLE "Users" ALTER COLUMN "role" DROP DEFAULT;',
                    { transaction }
                );

                await queryInterface.sequelize.query(
                    `ALTER TABLE "Users" ALTER COLUMN "role" TYPE INTEGER USING ${buildPostgresRevertExpression()};`,
                    { transaction }
                );

                await queryInterface.sequelize.query(
                    'UPDATE "Users" SET "role" = 0 WHERE "role" IS NULL;',
                    { transaction }
                );

                await queryInterface.sequelize.query(
                    'ALTER TABLE "Users" ALTER COLUMN "role" SET DEFAULT 0;',
                    { transaction }
                );

                await queryInterface.sequelize.query(
                    'ALTER TABLE "Users" ALTER COLUMN "role" SET NOT NULL;',
                    { transaction }
                );

                await queryInterface.sequelize.query(
                    `DROP TYPE IF EXISTS ${ENUM_TYPE_NAME};`,
                    { transaction }
                );
            });
            return;
        }

        await queryInterface.sequelize.transaction(async (transaction) => {
            await queryInterface.sequelize.query(
                buildSqliteUpdateToNumbers(),
                { transaction }
            );

            await queryInterface.changeColumn(
                'Users',
                'role',
                {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    defaultValue: 0,
                },
                { transaction }
            );
        });
    },
};
