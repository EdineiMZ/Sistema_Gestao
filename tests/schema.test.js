#!/usr/bin/env node
'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = process.env.DB_DIALECT || 'sqlite';
process.env.DB_STORAGE = process.env.DB_STORAGE || ':memory:';

const Sequelize = require('sequelize');
const { sequelize } = require('../database/models');
const { ROLE_ORDER } = require('../src/constants/roles');

const DEFAULT_ROLE = ROLE_ORDER[0];

const { DataTypes } = Sequelize;
const queryInterface = sequelize.getQueryInterface();

const migrations = [
  require('../database/migrations/20240906-add-credit-balance-to-users'),
  require('../database/migrations/20240907-add-message-html-to-notifications'),
  require('../database/migrations/20240908-convert-user-role-to-enum'),
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
      role: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
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

    const now = new Date();
    await queryInterface.bulkInsert('Users', [
      { name: 'Cliente Base', role: 0, createdAt: now, updatedAt: now },
      { name: 'Colaborador Base', role: 1, createdAt: now, updatedAt: now },
      { name: 'Especialista Base', role: 2, createdAt: now, updatedAt: now },
    ]);

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
      scheduledAt: {
        type: DataTypes.DATE,
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

    if (!usersTable.role) {
      throw new Error('Coluna "role" não encontrada na tabela Users após migração.');
    }

    const roleType = (usersTable.role.type || '').toLowerCase();
    if (roleType.includes('int')) {
      throw new Error('Coluna "role" deveria ter sido convertida para enum/string.');
    }

    if (usersTable.role.allowNull) {
      throw new Error('Coluna "role" deveria ser NOT NULL.');
    }

    const rawDefault = usersTable.role.defaultValue;
    const normalizedDefault = typeof rawDefault === 'string'
      ? rawDefault.replace(/['"`]/g, '')
      : rawDefault;

    if (normalizedDefault !== DEFAULT_ROLE) {
      throw new Error(`Valor padrão da coluna "role" deveria ser "${DEFAULT_ROLE}".`);
    }

    const [roleRows] = await sequelize.query('SELECT role FROM Users ORDER BY id');
    const roleValues = roleRows.map((row) => row.role);

    const expectedRoles = ROLE_ORDER.slice(0, roleValues.length);
    expectedRoles.forEach((expected, index) => {
      if (roleValues[index] !== expected) {
        throw new Error(`Valor da coluna "role" no registro ${index + 1} deveria ser "${expected}", mas foi "${roleValues[index]}".`);
      }
    });

    if (!usersTable.creditBalance) {
      throw new Error('Coluna "creditBalance" não encontrada na tabela Users.');
    }

    if (usersTable.creditBalance.allowNull) {
      throw new Error('Coluna "creditBalance" deveria ser NOT NULL.');
    }

    if (!notificationsTable.messageHtml) {
      throw new Error('Coluna "messageHtml" não encontrada na tabela Notifications.');
    }

    if (!notificationsTable.scheduledAt) {
      throw new Error('Coluna "scheduledAt" não encontrada na tabela Notifications.');
    }

    console.log('Verificação das colunas creditBalance, messageHtml e scheduledAt concluída com sucesso.');
  } catch (error) {
    console.error('Teste de schema falhou:', error);
    process.exitCode = 1;
  } finally {
    await queryInterface.dropTable('Users').catch(() => {});
    await queryInterface.dropTable('Notifications').catch(() => {});
    await sequelize.close();
  }
})();
