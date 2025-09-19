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

module.exports = {
    async up(queryInterface) {
        if (queryInterface.sequelize.getDialect() !== 'postgres') {
            return;
        }

        await queryInterface.sequelize.transaction(async (transaction) => {
            const newTypeExists = await doesTypeExist(queryInterface, transaction, NEW_ENUM_NAME);
            if (newTypeExists) {
                return;
            }

            const oldTypeExists = await doesTypeExist(queryInterface, transaction, OLD_ENUM_NAME);
            if (!oldTypeExists) {
                return;
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
