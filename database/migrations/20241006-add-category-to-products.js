'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('Products', 'category', {
            type: Sequelize.STRING(150),
            allowNull: true
        });
        await queryInterface.addIndex('Products', ['category']);
    },

    down: async (queryInterface) => {
        await queryInterface.removeIndex('Products', ['category']);
        await queryInterface.removeColumn('Products', 'category');
    }
};
