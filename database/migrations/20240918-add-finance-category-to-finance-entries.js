'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const columnName = 'financeCategoryId';
        const tableName = 'FinanceEntries';
        const compositeIndexName = 'finance_entries_user_category_idx';
        const simpleIndexName = 'finance_entries_category_idx';

        const tableDefinition = await queryInterface.describeTable(tableName);

        if (!tableDefinition[columnName]) {
            await queryInterface.addColumn(tableName, columnName, {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'FinanceCategories',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            });
        }

        const existingIndexes = await queryInterface.showIndex(tableName);
        const indexNames = existingIndexes.map((index) => index.name);

        if (!indexNames.includes(simpleIndexName)) {
            await queryInterface.addIndex(tableName, {
                name: simpleIndexName,
                fields: [columnName]
            });
        }

        // O índice composto depende da coluna userId; caso ela ainda não exista nesta etapa da evolução do schema
        // (por exemplo, ambientes que ainda não aplicaram a migração correspondente), evitamos criar o índice agora
        // para manter o processo idempotente e sem falhas.
        if (tableDefinition.userId && !indexNames.includes(compositeIndexName)) {
            await queryInterface.addIndex(tableName, {
                name: compositeIndexName,
                fields: ['userId', columnName]
            });
        }
    },

    down: async (queryInterface) => {
        const tableName = 'FinanceEntries';
        const columnName = 'financeCategoryId';
        const compositeIndexName = 'finance_entries_user_category_idx';
        const simpleIndexName = 'finance_entries_category_idx';

        const existingIndexes = await queryInterface.showIndex(tableName);
        const indexNames = new Set(existingIndexes.map((index) => index.name));

        if (indexNames.has(compositeIndexName)) {
            await queryInterface.removeIndex(tableName, compositeIndexName);
        }

        if (indexNames.has(simpleIndexName)) {
            await queryInterface.removeIndex(tableName, simpleIndexName);
        }

        const tableDefinition = await queryInterface.describeTable(tableName);
        if (tableDefinition[columnName]) {
            await queryInterface.removeColumn(tableName, columnName);
        }
    }
};
