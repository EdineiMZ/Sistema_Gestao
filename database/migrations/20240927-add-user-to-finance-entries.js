'use strict';

const extractRowCount = (rows) => {
    if (rows === null || rows === undefined) {
        return 0;
    }

    if (Array.isArray(rows)) {
        if (rows.length === 0) {
            return 0;
        }
        return extractRowCount(rows[0]);
    }

    if (typeof rows === 'object') {
        const value = rows.count
            ?? rows.COUNT
            ?? rows.total
            ?? rows.TOTAL
            ?? rows['count(*)']
            ?? rows['COUNT(*)']
            ?? rows['COUNT']
            ?? rows['total']
            ?? rows['TOTAL'];

        if (value === undefined || value === null) {
            return 0;
        }

        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : 0;
    }

    const numeric = Number(rows);
    return Number.isFinite(numeric) ? numeric : 0;
};

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tableName = 'FinanceEntries';
        const columnName = 'userId';
        const userIndexName = 'finance_entries_user_idx';
        const compositeIndexName = 'finance_entries_user_category_idx';

        const tableDefinition = await queryInterface.describeTable(tableName);

        if (!tableDefinition[columnName]) {
            await queryInterface.addColumn(tableName, columnName, {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'Users',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            });
        }

        const existingIndexes = await queryInterface.showIndex(tableName);
        const indexNames = new Set(existingIndexes.map((index) => index.name));

        if (!indexNames.has(userIndexName)) {
            await queryInterface.addIndex(tableName, {
                name: userIndexName,
                fields: [columnName]
            });
        }

        if (tableDefinition.financeCategoryId && !indexNames.has(compositeIndexName)) {
            await queryInterface.addIndex(tableName, {
                name: compositeIndexName,
                fields: ['userId', 'financeCategoryId']
            });
        }

        const countResult = await queryInterface.rawSelect(
            tableName,
            {
                plain: true,
                attributes: [[Sequelize.fn('COUNT', Sequelize.col('*')), 'count']]
            },
            'count'
        );

        const totalRows = extractRowCount(countResult);

        if (totalRows === 0) {
            await queryInterface.changeColumn(tableName, columnName, {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            });
        }
    },

    down: async (queryInterface) => {
        const tableName = 'FinanceEntries';
        const columnName = 'userId';
        const userIndexName = 'finance_entries_user_idx';
        const compositeIndexName = 'finance_entries_user_category_idx';

        const existingIndexes = await queryInterface.showIndex(tableName);
        const indexNames = new Set(existingIndexes.map((index) => index.name));

        if (indexNames.has(compositeIndexName)) {
            await queryInterface.removeIndex(tableName, compositeIndexName);
        }

        if (indexNames.has(userIndexName)) {
            await queryInterface.removeIndex(tableName, userIndexName);
        }

        const tableDefinition = await queryInterface.describeTable(tableName);
        if (tableDefinition[columnName]) {
            await queryInterface.removeColumn(tableName, columnName);
        }
    }
};
