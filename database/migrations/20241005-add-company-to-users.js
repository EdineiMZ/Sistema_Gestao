'use strict';

const TABLE_NAME = 'Users';
const COMPANY_TABLE = 'Companies';
const ACCESS_LEVEL_COLUMN = 'companyAccessLevel';
const COMPANY_ID_COLUMN = 'companyId';
const INDEX_NAME = 'users_company_id_idx';
const ACCESS_LEVEL_INDEX = 'users_company_access_level_idx';

const COMPANY_ACCESS_LEVELS = ['owner', 'admin', 'manager', 'staff', 'viewer'];

const columnExists = async (queryInterface, table, column, transaction) => {
    try {
        const description = await queryInterface.describeTable(table, { transaction });
        return Object.prototype.hasOwnProperty.call(description, column);
    } catch (error) {
        return false;
    }
};

module.exports = {
    up: async (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction(async (transaction) => {
            const hasCompanyId = await columnExists(queryInterface, TABLE_NAME, COMPANY_ID_COLUMN, transaction);
            if (!hasCompanyId) {
                await queryInterface.addColumn(
                    TABLE_NAME,
                    COMPANY_ID_COLUMN,
                    {
                        type: Sequelize.INTEGER,
                        allowNull: true,
                        references: {
                            model: COMPANY_TABLE,
                            key: 'id'
                        },
                        onUpdate: 'CASCADE',
                        onDelete: 'SET NULL'
                    },
                    { transaction }
                );

                await queryInterface.addIndex(TABLE_NAME, [COMPANY_ID_COLUMN], {
                    name: INDEX_NAME,
                    transaction
                });
            }

            const hasAccessLevel = await columnExists(queryInterface, TABLE_NAME, ACCESS_LEVEL_COLUMN, transaction);
            if (!hasAccessLevel) {
                const columnDefinition = queryInterface.sequelize.options.dialect === 'postgres'
                    ? {
                        type: Sequelize.ENUM({ values: COMPANY_ACCESS_LEVELS, name: 'enum_Users_companyAccessLevel' }),
                        allowNull: false,
                        defaultValue: 'staff'
                    }
                    : {
                        type: Sequelize.STRING(20),
                        allowNull: false,
                        defaultValue: 'staff'
                    };

                if (queryInterface.sequelize.options.dialect === 'postgres') {
                    await queryInterface.sequelize
                        .query(
                            "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_Users_companyAccessLevel') THEN " +
                                "CREATE TYPE \"enum_Users_companyAccessLevel\" AS ENUM ('owner','admin','manager','staff','viewer'); " +
                                'END IF; END $$;',
                            { transaction }
                        );
                }

                await queryInterface.addColumn(
                    TABLE_NAME,
                    ACCESS_LEVEL_COLUMN,
                    columnDefinition,
                    { transaction }
                );

                await queryInterface.addIndex(TABLE_NAME, [ACCESS_LEVEL_COLUMN], {
                    name: ACCESS_LEVEL_INDEX,
                    transaction
                });
            }
        });
    },

    down: async (queryInterface) => {
        return queryInterface.sequelize.transaction(async (transaction) => {
            const hasAccessLevel = await columnExists(queryInterface, TABLE_NAME, ACCESS_LEVEL_COLUMN, transaction);
            if (hasAccessLevel) {
                await queryInterface.removeIndex(TABLE_NAME, ACCESS_LEVEL_INDEX, { transaction }).catch(() => {});
                await queryInterface.removeColumn(TABLE_NAME, ACCESS_LEVEL_COLUMN, { transaction });

                if (queryInterface.sequelize.options.dialect === 'postgres') {
                    await queryInterface.sequelize
                        .query("DROP TYPE IF EXISTS \"enum_Users_companyAccessLevel\";", { transaction })
                        .catch(() => {});
                }
            }

            const hasCompanyId = await columnExists(queryInterface, TABLE_NAME, COMPANY_ID_COLUMN, transaction);
            if (hasCompanyId) {
                await queryInterface.removeIndex(TABLE_NAME, INDEX_NAME, { transaction }).catch(() => {});
                await queryInterface.removeColumn(TABLE_NAME, COMPANY_ID_COLUMN, { transaction });
            }
        });
    }
};
