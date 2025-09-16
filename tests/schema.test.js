#!/usr/bin/env node
'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = process.env.DB_DIALECT || 'sqlite';
process.env.DB_STORAGE = process.env.DB_STORAGE || ':memory:';

const Sequelize = require('sequelize');
const { sequelize } = require('../database/models');

const { DataTypes } = Sequelize;
const queryInterface = sequelize.getQueryInterface();

const migrations = [
  require('../database/migrations/20240906-add-credit-balance-to-users'),
  require('../database/migrations/20240907-add-message-html-to-notifications'),
];

(async () => {
  try {
    await queryInterface.createTable('Users', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    });

    await queryInterface.createTable('Notifications', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    });

    for (const migration of migrations) {
      if (typeof migration.up === 'function') {
        await migration.up(queryInterface, Sequelize);
      }
    }

    const usersTable = await queryInterface.describeTable('Users');
    const notificationsTable = await queryInterface.describeTable('Notifications');

    if (!usersTable.creditBalance) {
      throw new Error('Coluna "creditBalance" não encontrada na tabela Users.');
    }

    if (usersTable.creditBalance.allowNull) {
      throw new Error('Coluna "creditBalance" deveria ser NOT NULL.');
    }

    if (!notificationsTable.messageHtml) {
      throw new Error('Coluna "messageHtml" não encontrada na tabela Notifications.');
    }

    console.log('Verificação das colunas creditBalance e messageHtml concluída com sucesso.');
  } catch (error) {
    console.error('Teste de schema falhou:', error);
    process.exitCode = 1;
  } finally {
    await queryInterface.dropTable('Users').catch(() => {});
    await queryInterface.dropTable('Notifications').catch(() => {});
    await sequelize.close();
  }
})();
