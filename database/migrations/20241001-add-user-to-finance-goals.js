'use strict';

const TABLE_NAME = 'FinanceGoals';
const INDEX_NAME = 'finance_goals_user_month_unique';

const describeTableSafely = async (queryInterface, transaction) => {
    try {
        return await queryInterface.describeTable(TABLE_NAME, { transaction });
    } catch (error) {
        return null;
    }
};

const ensureUserColumn = async (queryInterface, Sequelize, transaction) => {
    const tableDefinition = await describeTableSafely(queryInterface, transaction);
    if (!tableDefinition || tableDefinition.userId) {
        return;
    }

    await queryInterface.addColumn(
        TABLE_NAME,
        'userId',
        {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
                model: 'Users',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
        },
        { transaction }
    );
};

const dropLegacyMonthIndexes = async (queryInterface, transaction) => {
    const indexes = await queryInterface.showIndex(TABLE_NAME, { transaction }).catch(() => []);
    if (!Array.isArray(indexes)) {
        return;
    }

    const legacyIndexes = indexes.filter((index) => {
        if (!index || !index.fields || !index.fields.length) {
            return false;
        }
        const fields = index.fields.map((field) => field.attribute || field.name);
        return index.unique && fields.length === 1 && fields[0] === 'month';
    });

    for (const index of legacyIndexes) {
        const indexName = index.name || index.fields.join('_');
        try {
            await queryInterface.removeIndex(TABLE_NAME, indexName, { transaction });
        } catch (error) {
            if (process.env.NODE_ENV !== 'test') {
                // Best-effort removal; ignore if index does not exist in this dialect.
                console.warn(`Não foi possível remover índice antigo ${indexName}:`, error.message);
            }
        }
    }
};

const buildChangeColumnOptions = (Sequelize, overrides = {}) => ({
    type: Sequelize.DATEONLY,
    allowNull: false,
    ...overrides
});

const backfillUserId = async (queryInterface, transaction) => {
    const [users] = await queryInterface.sequelize.query(
        'SELECT "id" FROM "Users" ORDER BY "id" ASC LIMIT 1;',
        { transaction }
    );

    if (!Array.isArray(users) || users.length === 0) {
        return false;
    }

    const defaultUserId = users[0]?.id;
    if (!defaultUserId) {
        return false;
    }

    await queryInterface.sequelize.query(
        'UPDATE "FinanceGoals" SET "userId" = :userId WHERE "userId" IS NULL;',
        {
            transaction,
            replacements: { userId: defaultUserId }
        }
    );

    return true;
};

const ensureCompositeIndex = async (queryInterface, transaction) => {
    const indexes = await queryInterface.showIndex(TABLE_NAME, { transaction }).catch(() => []);
    const exists = Array.isArray(indexes)
        && indexes.some((index) => {
            if (!index || !index.fields || !index.unique) {
                return false;
            }
            const fields = index.fields.map((field) => field.attribute || field.name);
            return index.unique && fields.length === 2 && fields.includes('userId') && fields.includes('month');
        });

    if (!exists) {
        await queryInterface.addIndex(TABLE_NAME, {
            name: INDEX_NAME,
            unique: true,
            fields: ['userId', 'month'],
            transaction
        });
    }
};

module.exports = {
    async up(queryInterface, Sequelize) {
        const tableDefinition = await describeTableSafely(queryInterface);
        if (!tableDefinition) {
            return;
        }

        await queryInterface.sequelize.transaction(async (transaction) => {
            await ensureUserColumn(queryInterface, Sequelize, transaction);

            await dropLegacyMonthIndexes(queryInterface, transaction);

            await queryInterface.changeColumn(
                TABLE_NAME,
                'month',
                buildChangeColumnOptions(Sequelize),
                { transaction }
            );

            const backfilled = await backfillUserId(queryInterface, transaction);

            await queryInterface.changeColumn(
                TABLE_NAME,
                'userId',
                {
                    type: Sequelize.INTEGER,
                    allowNull: backfilled ? false : true,
                    references: {
                        model: 'Users',
                        key: 'id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE'
                },
                { transaction }
            );

            await ensureCompositeIndex(queryInterface, transaction);
        });
    },

    async down(queryInterface, Sequelize) {
        const tableDefinition = await describeTableSafely(queryInterface);
        if (!tableDefinition) {
            return;
        }

        await queryInterface.sequelize.transaction(async (transaction) => {
            try {
                await queryInterface.removeIndex(TABLE_NAME, INDEX_NAME, { transaction });
            } catch (error) {
                if (process.env.NODE_ENV !== 'test') {
                    console.warn(`Não foi possível remover índice ${INDEX_NAME}:`, error.message);
                }
            }

            await queryInterface.changeColumn(
                TABLE_NAME,
                'month',
                {
                    type: Sequelize.DATEONLY,
                    allowNull: false,
                    unique: true
                },
                { transaction }
            );

            await queryInterface.changeColumn(
                TABLE_NAME,
                'userId',
                {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: {
                        model: 'Users',
                        key: 'id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE'
                },
                { transaction }
            );

            await queryInterface.removeColumn(TABLE_NAME, 'userId', { transaction }).catch((error) => {
                if (process.env.NODE_ENV !== 'test') {
                    console.warn('Não foi possível remover a coluna userId:', error.message);
                }
            });
        });
    }
};
