'use strict';

const OLD_ENUM_NAME = 'user_role_enum';
const NEW_ENUM_NAME = 'enum_Users_role';

const doesTypeExist = async (queryInterface, transaction, typeName) => {
    const [results] = await queryInterface.sequelize.query(
        `SELECT EXISTS (
            SELECT 1
            FROM pg_type
            WHERE typname = :typeName
        ) AS "exists";`,
        {
            transaction,
            replacements: { typeName }
        }
    );

    return Boolean(results?.[0]?.exists);
};

const getColumnUdtName = async (queryInterface, transaction, tableName, columnName) => {
    const [results] = await queryInterface.sequelize.query(
        `SELECT udt_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = :tableName
          AND column_name = :columnName
        LIMIT 1;`,
        {
            transaction,
            replacements: {
                tableName,
                columnName
            }
        }
    );

    return results?.[0]?.udt_name ?? null;
};

module.exports = {
    async up(queryInterface) {
        if (queryInterface.sequelize.getDialect() !== 'postgres') {
            return;
        }

        await queryInterface.sequelize.transaction(async (transaction) => {
            const columnUdtName = await getColumnUdtName(queryInterface, transaction, 'Users', 'role');

            if (!columnUdtName) {
                return;
            }

            if (columnUdtName === NEW_ENUM_NAME) {
                return;
            }

            if (columnUdtName !== OLD_ENUM_NAME) {
                return;
            }

            const oldTypeExists = await doesTypeExist(queryInterface, transaction, OLD_ENUM_NAME);
            if (!oldTypeExists) {
                return;
            }

            const newTypeExists = await doesTypeExist(queryInterface, transaction, NEW_ENUM_NAME);
            if (newTypeExists) {
                await queryInterface.sequelize.query(
                    `DROP TYPE "${NEW_ENUM_NAME}";`,
                    { transaction }
                );
            }

            await queryInterface.sequelize.query(
                `ALTER TYPE ${OLD_ENUM_NAME} RENAME TO "${NEW_ENUM_NAME}";`,
                { transaction }
            );
        });
    },

    async down(queryInterface) {
        if (queryInterface.sequelize.getDialect() !== 'postgres') {
            return;
        }

        await queryInterface.sequelize.transaction(async (transaction) => {
            const typeExists = await doesTypeExist(queryInterface, transaction, NEW_ENUM_NAME);
            if (!typeExists) {
                return;
            }

            await queryInterface.sequelize.query(
                `ALTER TYPE "${NEW_ENUM_NAME}" RENAME TO ${OLD_ENUM_NAME};`,
                { transaction }
            );
        });
    }
};
