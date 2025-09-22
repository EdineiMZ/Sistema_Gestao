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

    const dialect = queryInterface.sequelize.getDialect();

    for (const index of legacyIndexes) {
        const indexName = index.name || index.fields.join('_');
        const constraintName = index.constraintName || indexName;
        const sanitizedConstraintName = constraintName.replace(/"/g, '""');
        const sanitizedIndexName = indexName.replace(/"/g, '""');

        const hasConstraintHint = index.primary === true || Boolean(index.constraintName);
        const shouldTryConstraintRemoval = hasConstraintHint || (dialect === 'postgres' && index.unique);

        let removalSucceeded = false;

        if (shouldTryConstraintRemoval) {
            try {
                await queryInterface.removeConstraint(TABLE_NAME, constraintName, { transaction });
                removalSucceeded = true;
            } catch (constraintError) {
                const isMissingConstraint =
                    constraintError?.original?.code === '42704'
                    || /does not exist/i.test(constraintError?.message || '');

                if (!isMissingConstraint && dialect === 'postgres') {
                    try {
                        await queryInterface.sequelize.query(
                            `DROP INDEX IF EXISTS "${sanitizedConstraintName}" CASCADE;`,
                            { transaction }
                        );
                        removalSucceeded = true;
                    } catch (dropError) {
                        if (process.env.NODE_ENV !== 'test') {
                            console.error(
                                `Falha ao remover constraint antiga ${constraintName}:`,
                                dropError.message
                            );
                        }
                        throw dropError;
                    }
                } else if (!isMissingConstraint) {
                    if (process.env.NODE_ENV !== 'test') {
                        console.error(
                            `Falha ao remover constraint antiga ${constraintName}:`,
                            constraintError.message
                        );
                    }
                    throw constraintError;
                }
            }
        }

        if (removalSucceeded) {
            continue;
        }

        try {
            await queryInterface.removeIndex(TABLE_NAME, indexName, { transaction });
        } catch (indexError) {
            if (dialect === 'postgres') {
                try {
                    await queryInterface.sequelize.query(
                        `DROP INDEX IF EXISTS "${sanitizedIndexName}" CASCADE;`,
                        { transaction }
                    );
                    continue;
                } catch (dropError) {
                    if (process.env.NODE_ENV !== 'test') {
                        console.error(
                            `Falha ao remover índice antigo ${indexName}:`,
                            dropError.message
                        );
                    }
                    throw dropError;
                }
            }

            if (process.env.NODE_ENV !== 'test') {
                console.error(`Falha ao remover índice antigo ${indexName}:`, indexError.message);
            }
            throw indexError;
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
