'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('Users', 'twoFactorEnabled', {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        });

        await queryInterface.addColumn('Users', 'twoFactorCodeHash', {
            type: Sequelize.STRING(128),
            allowNull: true
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('Users', 'twoFactorCodeHash');
        await queryInterface.removeColumn('Users', 'twoFactorEnabled');
    }
};
