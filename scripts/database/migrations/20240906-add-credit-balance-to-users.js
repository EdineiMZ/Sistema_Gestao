'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Users', 'creditBalance', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Users', 'creditBalance');
  },
};
