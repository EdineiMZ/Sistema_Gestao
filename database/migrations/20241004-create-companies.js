'use strict';

const TABLE_NAME = 'Companies';
const STATUS_ENUM_NAME = 'enum_Companies_status';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        return queryInterface.sequelize.transaction(async (transaction) => {
            const tableExists = await queryInterface
                .showAllTables({ transaction })
                .then((tables) => tables.map((table) => (typeof table === 'string' ? table : table.tableName)))
                .then((tables) => tables.includes(TABLE_NAME))
                .catch(() => false);

            if (tableExists) {
                return;
            }

            if (queryInterface.sequelize.options.dialect === 'postgres') {
                const enumExists = await queryInterface.sequelize
                    .query(
                        'SELECT typname FROM pg_type WHERE typname = :enumName LIMIT 1',
                        { replacements: { enumName: STATUS_ENUM_NAME }, transaction }
                    )
                    .then(([rows]) => rows.length > 0);

                if (!enumExists) {
                    await queryInterface.sequelize.query(
                        `CREATE TYPE "${STATUS_ENUM_NAME}" AS ENUM ('active', 'inactive');`,
                        { transaction }
                    );
                }
            }

            await queryInterface.createTable(
                TABLE_NAME,
                {
                    id: {
                        type: Sequelize.INTEGER,
                        autoIncrement: true,
                        allowNull: false,
                        primaryKey: true
                    },
                    cnpj: {
                        type: Sequelize.STRING(14),
                        allowNull: false,
                        unique: true
                    },
                    corporateName: {
                        type: Sequelize.STRING(180),
                        allowNull: false
                    },
                    tradeName: {
                        type: Sequelize.STRING(180),
                        allowNull: true
                    },
                    stateRegistration: {
                        type: Sequelize.STRING(30),
                        allowNull: true
                    },
                    municipalRegistration: {
                        type: Sequelize.STRING(30),
                        allowNull: true
                    },
                    taxRegime: {
                        type: Sequelize.STRING(60),
                        allowNull: true
                    },
                    email: {
                        type: Sequelize.STRING(160),
                        allowNull: true
                    },
                    phone: {
                        type: Sequelize.STRING(20),
                        allowNull: true
                    },
                    mobilePhone: {
                        type: Sequelize.STRING(20),
                        allowNull: true
                    },
                    website: {
                        type: Sequelize.STRING(200),
                        allowNull: true
                    },
                    openingDate: {
                        type: Sequelize.DATEONLY,
                        allowNull: true
                    },
                    zipCode: {
                        type: Sequelize.STRING(8),
                        allowNull: true
                    },
                    addressLine: {
                        type: Sequelize.STRING(200),
                        allowNull: true
                    },
                    number: {
                        type: Sequelize.STRING(20),
                        allowNull: true
                    },
                    complement: {
                        type: Sequelize.STRING(100),
                        allowNull: true
                    },
                    neighborhood: {
                        type: Sequelize.STRING(120),
                        allowNull: true
                    },
                    city: {
                        type: Sequelize.STRING(120),
                        allowNull: true
                    },
                    state: {
                        type: Sequelize.STRING(2),
                        allowNull: true
                    },
                    country: {
                        type: Sequelize.STRING(60),
                        allowNull: true,
                        defaultValue: 'Brasil'
                    },
                    status: {
                        type: queryInterface.sequelize.options.dialect === 'postgres'
                            ? Sequelize.ENUM({ values: ['active', 'inactive'], name: STATUS_ENUM_NAME })
                            : Sequelize.STRING(20),
                        allowNull: false,
                        defaultValue: 'active'
                    },
                    notes: {
                        type: Sequelize.TEXT,
                        allowNull: true
                    },
                    createdAt: {
                        type: Sequelize.DATE,
                        allowNull: false,
                        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                    },
                    updatedAt: {
                        type: Sequelize.DATE,
                        allowNull: false,
                        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                    }
                },
                { transaction }
            );

            await queryInterface.addIndex(TABLE_NAME, ['cnpj'], {
                unique: true,
                name: 'companies_cnpj_unique',
                transaction
            });

            await queryInterface.addIndex(TABLE_NAME, ['corporateName'], {
                name: 'companies_corporate_name_idx',
                transaction
            });

            await queryInterface.addIndex(TABLE_NAME, ['status'], {
                name: 'companies_status_idx',
                transaction
            });
        });
    },

    down: async (queryInterface) => {
        return queryInterface.sequelize.transaction(async (transaction) => {
            const tableExists = await queryInterface
                .showAllTables({ transaction })
                .then((tables) => tables.map((table) => (typeof table === 'string' ? table : table.tableName)))
                .then((tables) => tables.includes(TABLE_NAME))
                .catch(() => false);

            if (!tableExists) {
                return;
            }

            await queryInterface.removeIndex(TABLE_NAME, 'companies_status_idx', { transaction }).catch(() => {});
            await queryInterface.removeIndex(TABLE_NAME, 'companies_corporate_name_idx', { transaction }).catch(() => {});
            await queryInterface.removeIndex(TABLE_NAME, 'companies_cnpj_unique', { transaction }).catch(() => {});

            await queryInterface.dropTable(TABLE_NAME, { transaction });

            if (queryInterface.sequelize.options.dialect === 'postgres') {
                await queryInterface.sequelize
                    .query(`DROP TYPE IF EXISTS "${STATUS_ENUM_NAME}";`, { transaction })
                    .catch(() => {});
            }
        });
    }
};
