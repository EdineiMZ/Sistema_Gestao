'use strict';

const { USER_ROLES } = require('../constants/roles');

const normalizeTableName = (table) => {
    if (!table) {
        return '';
    }

    if (typeof table === 'string') {
        return table.replace(/["'`\[\]]/g, '').toLowerCase();
    }

    if (typeof table === 'object') {
        const tableName = table.tableName || table.name || table.toString();
        return normalizeTableName(tableName);
    }

    return String(table).toLowerCase();
};

const getDefaultModels = () => require('../../database/models');

const ensureFinanceEntriesUserId = async (deps = {}) => {
    const {
        logger = console,
        sequelize: providedSequelize,
        User: providedUser,
        FinanceEntry: providedFinanceEntry,
        models: providedModels
    } = deps;

    const models = providedModels || getDefaultModels();
    const sequelize = providedSequelize || models.sequelize;
    const User = providedUser || models.User;
    const FinanceEntry = providedFinanceEntry || models.FinanceEntry;

    if (!sequelize || !User || !FinanceEntry) {
        throw new Error('Finance entry cleanup requires Sequelize models to be available.');
    }

    const queryInterface = sequelize.getQueryInterface();
    const rawTables = await queryInterface.showAllTables();
    const tables = rawTables.map(normalizeTableName);

    if (!tables.includes('users') || !tables.includes('financeentries')) {
        return { skipped: true, updatedRows: 0 };
    }

    const transaction = await sequelize.transaction();

    try {
        const fallbackUser = await User.unscoped().findOne({
            where: { role: USER_ROLES.ADMIN },
            order: [['createdAt', 'ASC']],
            transaction
        }) || await User.unscoped().findOne({
            order: [['createdAt', 'ASC']],
            transaction
        });

        if (!fallbackUser) {
            throw new Error(
                'No fallback user found to own legacy finance entries. Please create at least one user and restart the server.'
            );
        }

        const fallbackUserId = fallbackUser.id ?? fallbackUser.get?.('id');

        const [updatedRows] = await FinanceEntry.update(
            { userId: fallbackUserId },
            {
                where: { userId: null },
                transaction
            }
        );

        await transaction.commit();

        if (updatedRows > 0 && logger && typeof logger.info === 'function') {
            logger.info(
                `Attached ${updatedRows} finance entr${updatedRows === 1 ? 'y' : 'ies'} to fallback user #${fallbackUserId}.`
            );
        }

        return { updatedRows, fallbackUserId };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

module.exports = {
    ensureFinanceEntriesUserId
};
