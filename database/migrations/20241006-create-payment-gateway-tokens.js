'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('PaymentGatewayTokens', {
            id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                allowNull: false,
                primaryKey: true
            },
            companyId: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Companies',
                    key: 'id'
                },
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            },
            companyCnpj: {
                type: Sequelize.STRING(14),
                allowNull: false
            },
            provider: {
                type: Sequelize.STRING(60),
                allowNull: false
            },
            apiName: {
                type: Sequelize.STRING(60),
                allowNull: false
            },
            bankName: {
                type: Sequelize.STRING(120),
                allowNull: false
            },
            integrationKey: {
                type: Sequelize.STRING(255),
                allowNull: false
            },
            encryptedToken: {
                type: Sequelize.TEXT,
                allowNull: false
            },
            encryptionIv: {
                type: Sequelize.STRING(32),
                allowNull: false
            },
            encryptionAuthTag: {
                type: Sequelize.STRING(32),
                allowNull: false
            },
            tokenHash: {
                type: Sequelize.STRING(128),
                allowNull: false
            },
            tokenPreview: {
                type: Sequelize.STRING(32),
                allowNull: false
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        });

        await queryInterface.addIndex('PaymentGatewayTokens', {
            name: 'payment_gateway_tokens_company_api_bank_unique',
            unique: true,
            fields: ['companyId', 'apiName', 'bankName']
        });

        await queryInterface.addIndex('PaymentGatewayTokens', {
            name: 'payment_gateway_tokens_integration_key_unique',
            unique: true,
            fields: ['integrationKey']
        });

        await queryInterface.addIndex('PaymentGatewayTokens', {
            name: 'payment_gateway_tokens_hash_idx',
            fields: ['tokenHash']
        });
    },

    down: async (queryInterface) => {
        await queryInterface.removeIndex('PaymentGatewayTokens', 'payment_gateway_tokens_hash_idx');
        await queryInterface.removeIndex('PaymentGatewayTokens', 'payment_gateway_tokens_integration_key_unique');
        await queryInterface.removeIndex('PaymentGatewayTokens', 'payment_gateway_tokens_company_api_bank_unique');
        await queryInterface.dropTable('PaymentGatewayTokens');
    }
};
