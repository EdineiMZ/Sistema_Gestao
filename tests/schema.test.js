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
  require('../database/migrations/20240909-add-status-and-previewtext-to-notifications'),
  require('../database/migrations/20240911-fix-accent-color-on-notifications'),
  require('../database/migrations/20240912-create-notification-dispatch-logs'),
  require('../database/migrations/20240913-create-finance-goals'),
  require('../database/migrations/20240915-create-finance-attachments'),
  require('../database/migrations/20240916-create-finance-categories'),
  require('../database/migrations/20240917-create-budgets'),
  require('../database/migrations/20240918-create-budget-threshold-statuses'),
];

(async () => {
  try {
    if (sequelize.getDialect() === 'sqlite') {
      await sequelize.query('PRAGMA foreign_keys = ON;');
    }

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

    const seedNow = new Date();
    await queryInterface.bulkInsert('Users', [
      { name: 'Cliente Base', role: 0, createdAt: seedNow, updatedAt: seedNow },
      { name: 'Colaborador Base', role: 1, createdAt: seedNow, updatedAt: seedNow },
      { name: 'Especialista Base', role: 2, createdAt: seedNow, updatedAt: seedNow },
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

    await queryInterface.createTable('FinanceEntries', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      description: {
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

    if (!notificationsTable.status) {
      throw new Error('Coluna "status" não encontrada na tabela Notifications.');
    }

    if (notificationsTable.status.allowNull) {
      throw new Error('Coluna "status" deveria ser NOT NULL.');
    }

    const rawStatusDefault = notificationsTable.status.defaultValue;
    const normalizedStatusDefault = typeof rawStatusDefault === 'string'
      ? rawStatusDefault.replace(/['"`]/g, '')
      : rawStatusDefault;

    if (normalizedStatusDefault !== 'draft') {
      throw new Error('Valor padrão da coluna "status" deveria ser "draft".');
    }

    const statusType = (notificationsTable.status.type || '').toLowerCase();
    if (!statusType.includes('char') && !statusType.includes('string') && !statusType.includes('text')) {
      throw new Error('Tipo da coluna "status" deveria ser textual.');
    }

    if (!notificationsTable.previewText) {
      throw new Error('Coluna "previewText" não encontrada na tabela Notifications.');
    }

    if (notificationsTable.previewText.allowNull === false) {
      throw new Error('Coluna "previewText" deveria permitir valores nulos.');
    }

    const previewType = (notificationsTable.previewText.type || '').toLowerCase();
    if (!previewType.includes('char') && !previewType.includes('string')) {
      throw new Error('Tipo da coluna "previewText" deveria ser textual.');
    }

    if (!previewType.includes('120')) {
      throw new Error('Campo "previewText" deveria limitar o tamanho para 120 caracteres.');
    }

    if (!notificationsTable.accentColor) {
      throw new Error('Coluna "accentColor" não encontrada na tabela Notifications.');
    }

    if (notificationsTable.accentColor.allowNull) {
      throw new Error('Coluna "accentColor" deveria ser NOT NULL.');
    }

    const accentDefault = notificationsTable.accentColor.defaultValue;
    const normalizedAccentDefault = typeof accentDefault === 'string'
      ? accentDefault.replace(/['"`]/g, '')
      : accentDefault;

    if (normalizedAccentDefault !== '#0d6efd') {
      throw new Error('Valor padrão da coluna "accentColor" deveria ser "#0d6efd".');
    }

    const accentType = (notificationsTable.accentColor.type || '').toLowerCase();
    if (!accentType.includes('char') && !accentType.includes('string') && !accentType.includes('text')) {
      throw new Error('Tipo da coluna "accentColor" deveria ser textual.');
    }

    const financeCategoriesTable = await queryInterface.describeTable('FinanceCategories');
    if (!financeCategoriesTable.name) {
      throw new Error('Tabela FinanceCategories deveria possuir coluna "name".');
    }

    if (financeCategoriesTable.name.allowNull) {
      throw new Error('Coluna "name" em FinanceCategories deveria ser NOT NULL.');
    }

    if (!financeCategoriesTable.slug || financeCategoriesTable.slug.allowNull) {
      throw new Error('Coluna "slug" em FinanceCategories deveria ser NOT NULL.');
    }

    if (!financeCategoriesTable.color || financeCategoriesTable.color.allowNull) {
      throw new Error('Coluna "color" em FinanceCategories deveria ser NOT NULL.');
    }

    const colorDefault = financeCategoriesTable.color.defaultValue;
    const normalizedColorDefault = typeof colorDefault === 'string'
      ? colorDefault.replace(/['"`]/g, '').toLowerCase()
      : colorDefault;

    if ((normalizedColorDefault || '').toLowerCase() !== '#6c757d') {
      throw new Error('Valor padrão da coluna "color" deveria ser "#6c757d".');
    }

    const isActiveDefault = financeCategoriesTable.isActive.defaultValue;
    const normalizedIsActiveDefault = typeof isActiveDefault === 'string'
      ? isActiveDefault.replace(/['"`]/g, '').toLowerCase()
      : String(isActiveDefault).toLowerCase();

    if (!['1', 'true'].includes(normalizedIsActiveDefault)) {
      throw new Error('Valor padrão da coluna "isActive" deveria ser verdadeiro.');
    }

    const categoryIndexes = await queryInterface.showIndex('FinanceCategories');
    const hasOwnerSlugUnique = categoryIndexes.some((index) => index.name === 'finance_categories_owner_slug_unique' && index.unique);
    if (!hasOwnerSlugUnique) {
      throw new Error('Índice único (ownerId, slug) não encontrado em FinanceCategories.');
    }

    const budgetsTable = await queryInterface.describeTable('Budgets');
    if (!budgetsTable.userId || budgetsTable.userId.allowNull) {
      throw new Error('Coluna "userId" em Budgets deveria ser NOT NULL.');
    }

    if (!budgetsTable.financeCategoryId || budgetsTable.financeCategoryId.allowNull) {
      throw new Error('Coluna "financeCategoryId" em Budgets deveria ser NOT NULL.');
    }

    if (!budgetsTable.monthlyLimit || budgetsTable.monthlyLimit.allowNull) {
      throw new Error('Coluna "monthlyLimit" em Budgets deveria ser NOT NULL.');
    }

    if (!budgetsTable.thresholds) {
      throw new Error('Coluna "thresholds" não encontrada na tabela Budgets.');
    }

    const budgetsIndexes = await queryInterface.showIndex('Budgets');
    const hasBudgetUnique = budgetsIndexes.some((index) => index.name === 'budgets_user_category_unique' && index.unique);
    if (!hasBudgetUnique) {
      throw new Error('Índice único (userId, financeCategoryId) não encontrado em Budgets.');
    }

    const budgetNow = new Date();
    const [users] = await sequelize.query('SELECT id FROM Users ORDER BY id LIMIT 1');
    const userId = users[0]?.id;
    if (!userId) {
      throw new Error('Usuário base não encontrado para validar relacionamentos de Budget.');
    }

    await queryInterface.bulkInsert('FinanceCategories', [{
      name: 'Custos Fixos',
      slug: 'custos-fixos',
      color: '#123abc',
      ownerId: userId,
      isActive: true,
      createdAt: budgetNow,
      updatedAt: budgetNow,
    }]);

    const [categories] = await sequelize.query('SELECT id, ownerId FROM FinanceCategories ORDER BY id DESC LIMIT 1');
    const categoryId = categories[0]?.id;
    if (!categoryId) {
      throw new Error('Falha ao inserir categoria financeira para testes.');
    }

    await queryInterface.bulkInsert('Budgets', [{
      userId,
      financeCategoryId: categoryId,
      monthlyLimit: 1500.50,
      thresholds: JSON.stringify([0.5, 0.75, 0.9]),
      referenceMonth: '2024-09-01',
      createdAt: budgetNow,
      updatedAt: budgetNow,
    }]);

    let duplicateError = null;
    try {
      await queryInterface.bulkInsert('Budgets', [{
        userId,
        financeCategoryId: categoryId,
        monthlyLimit: 2000,
        thresholds: JSON.stringify([0.5]),
        referenceMonth: '2024-10-01',
        createdAt: budgetNow,
        updatedAt: budgetNow,
      }]);
    } catch (error) {
      duplicateError = error;
    }

    if (!duplicateError) {
      throw new Error('Inserção duplicada em Budgets deveria violar índice único.');
    }

    await queryInterface.bulkDelete('Users', { id: userId });

    const [remainingBudgets] = await sequelize.query('SELECT COUNT(*) as count FROM Budgets');
    const budgetsCount = Number(remainingBudgets[0]?.count || 0);
    if (budgetsCount !== 0) {
      throw new Error('Registros em Budgets deveriam ser removidos ao excluir usuário associado.');
    }

    const [remainingCategories] = await sequelize.query('SELECT ownerId FROM FinanceCategories ORDER BY id DESC LIMIT 1');
    const ownerAfterDelete = remainingCategories[0]?.ownerId;
    if (ownerAfterDelete !== null && ownerAfterDelete !== undefined) {
      throw new Error('ownerId da categoria deveria ser definido como NULL após exclusão do usuário.');
    }

    console.log('Verificações das colunas e relacionamentos das tabelas Users, Notifications, FinanceCategories e Budgets concluídas com sucesso.');
  } catch (error) {
    console.error('Teste de schema falhou:', error);
    process.exitCode = 1;
  } finally {
    await queryInterface.dropTable('Budgets').catch(() => {});
    await queryInterface.dropTable('FinanceCategories').catch(() => {});
    await queryInterface.dropTable('FinanceAttachments').catch(() => {});
    await queryInterface.dropTable('FinanceGoals').catch(() => {});
    await queryInterface.dropTable('NotificationDispatchLogs').catch(() => {});
    await queryInterface.dropTable('FinanceEntries').catch(() => {});
    await queryInterface.dropTable('Notifications').catch(() => {});
    await queryInterface.dropTable('Users').catch(() => {});
    await sequelize.close();
  }
})();
