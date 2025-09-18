'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('FinanceCategoryRates', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            userId: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'Users',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            financeCategoryId: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'FinanceCategories',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            },
            ratePeriod: {
                type: Sequelize.STRING(16),
                allowNull: false,
                defaultValue: 'annual'
            },
            simpleRate: {
                type: Sequelize.DECIMAL(10, 6),
                allowNull: false,
                defaultValue: 0
            },
            compoundRate: {
                type: Sequelize.DECIMAL(10, 6),
                allowNull: false,
                defaultValue: 0
            },
            contributionAmount: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: false,
                defaultValue: 0
            },
            contributionFrequency: {
                type: Sequelize.STRING(16),
                allowNull: false,
                defaultValue: 'monthly'
            },
            periodMonths: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            notes: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE
            }
        });

        await queryInterface.addIndex('FinanceCategoryRates', {
            name: 'finance_category_rates_user_category_unique',
            unique: true,
            fields: ['userId', 'financeCategoryId']
        });

        await queryInterface.addIndex('FinanceCategoryRates', {
            name: 'finance_category_rates_category_idx',
            fields: ['financeCategoryId']
        });
    },

    down: async (queryInterface) => {
        await queryInterface.removeIndex('FinanceCategoryRates', 'finance_category_rates_category_idx');
        await queryInterface.removeIndex('FinanceCategoryRates', 'finance_category_rates_user_category_unique');
        await queryInterface.dropTable('FinanceCategoryRates');
    }
};
