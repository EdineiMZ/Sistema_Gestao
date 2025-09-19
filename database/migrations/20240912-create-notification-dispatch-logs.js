'use strict';

const TABLE_NAME = 'NotificationDispatchLogs';
const UNIQUE_CONSTRAINT_NAME = 'notification_dispatch_unique_per_context';
const CYCLE_INDEX_NAME = 'notification_dispatch_cycle_idx';
const RECIPIENT_INDEX_NAME = 'notification_dispatch_recipient_idx';

const buildTimestampDefault = (queryInterface) => {
    const dialect = queryInterface.sequelize?.getDialect?.() || queryInterface.sequelize?.dialect?.name;
    if (typeof dialect === 'string' && dialect.toLowerCase() === 'sqlite') {
        return queryInterface.sequelize.literal("CURRENT_TIMESTAMP");
    }
    return queryInterface.sequelize.fn('NOW');
};

const doesTableExist = async (queryInterface, tableName) => {
    try {
        await queryInterface.describeTable(tableName);
        return true;
    } catch (error) {
        const message = error?.message?.toLowerCase?.() || '';
        if (
            message.includes('does not exist') ||
            message.includes('unknown table') ||
            message.includes('no such table') ||
            message.includes('no description found')
        ) {
            return false;
        }
        throw error;
    }
};

const hasNamedIndex = (indexes, name) => {
    return indexes.some((index) => index.name === name || index.constraintName === name);
};

const ensureIndexOrConstraint = async (queryInterface, tableName, name, creator) => {
    const indexes = await queryInterface.showIndex(tableName);
    if (!hasNamedIndex(indexes, name)) {
        await creator();
    }
};

module.exports = {
    async up(queryInterface, Sequelize) {
        const tableExists = await doesTableExist(queryInterface, TABLE_NAME);

        if (!tableExists) {
            await queryInterface.createTable(TABLE_NAME, {
                id: {
                    type: Sequelize.INTEGER,
                    autoIncrement: true,
                    primaryKey: true
                },
                notificationId: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: {
                        model: 'Notifications',
                        key: 'id'
                    },
                    onDelete: 'CASCADE',
                    onUpdate: 'CASCADE'
                },
                recipient: {
                    type: Sequelize.STRING,
                    allowNull: false
                },
                cycleKey: {
                    type: Sequelize.STRING,
                    allowNull: false
                },
                contextHash: {
                    type: Sequelize.STRING(64),
                    allowNull: false
                },
                context: {
                    type: Sequelize.JSON,
                    allowNull: true
                },
                sentAt: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: buildTimestampDefault(queryInterface)
                },
                createdAt: {
                    allowNull: false,
                    type: Sequelize.DATE,
                    defaultValue: buildTimestampDefault(queryInterface)
                },
                updatedAt: {
                    allowNull: false,
                    type: Sequelize.DATE,
                    defaultValue: buildTimestampDefault(queryInterface)
                }
            });
        }

        if (!(await doesTableExist(queryInterface, TABLE_NAME))) {
            return;
        }

        await ensureIndexOrConstraint(queryInterface, TABLE_NAME, UNIQUE_CONSTRAINT_NAME, () =>
            queryInterface.addConstraint(TABLE_NAME, {
                fields: ['notificationId', 'recipient', 'contextHash'],
                type: 'unique',
                name: UNIQUE_CONSTRAINT_NAME
            })
        );

        await ensureIndexOrConstraint(queryInterface, TABLE_NAME, CYCLE_INDEX_NAME, () =>
            queryInterface.addIndex(TABLE_NAME, {
                fields: ['notificationId', 'cycleKey'],
                name: CYCLE_INDEX_NAME
            })
        );

        await ensureIndexOrConstraint(queryInterface, TABLE_NAME, RECIPIENT_INDEX_NAME, () =>
            queryInterface.addIndex(TABLE_NAME, {
                fields: ['notificationId', 'recipient'],
                name: RECIPIENT_INDEX_NAME
            })
        );
    },

    async down(queryInterface) {
        if (!(await doesTableExist(queryInterface, TABLE_NAME))) {
            return;
        }

        const removeIfExists = async (name, remover) => {
            const indexes = await queryInterface.showIndex(TABLE_NAME);
            if (hasNamedIndex(indexes, name)) {
                await remover();
            }
        };

        await removeIfExists(RECIPIENT_INDEX_NAME, () =>
            queryInterface.removeIndex(TABLE_NAME, RECIPIENT_INDEX_NAME)
        );

        await removeIfExists(CYCLE_INDEX_NAME, () =>
            queryInterface.removeIndex(TABLE_NAME, CYCLE_INDEX_NAME)
        );

        await removeIfExists(UNIQUE_CONSTRAINT_NAME, () =>
            queryInterface.removeConstraint(TABLE_NAME, UNIQUE_CONSTRAINT_NAME)
        );

        if (await doesTableExist(queryInterface, TABLE_NAME)) {
            await queryInterface.dropTable(TABLE_NAME);
        }
    }
};
