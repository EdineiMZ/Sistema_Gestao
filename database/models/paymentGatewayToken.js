'use strict';

const normalizeKeySegment = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    const raw = String(value).trim();
    if (!raw) {
        return null;
    }

    const normalized = raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toUpperCase();

    return normalized || null;
};

const sanitizeDigits = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    const digits = String(value).replace(/\D+/g, '');
    return digits.length ? digits : null;
};

module.exports = (sequelize, DataTypes) => {
    const PaymentGatewayToken = sequelize.define('PaymentGatewayToken', {
        companyId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            validate: {
                isInt: {
                    msg: 'Empresa inválida para o token de pagamento.'
                }
            }
        },
        companyCnpj: {
            type: DataTypes.STRING(14),
            allowNull: false,
            set(value) {
                const digits = sanitizeDigits(value);
                if (!digits || digits.length !== 14) {
                    throw new Error('CNPJ da empresa inválido para o token de pagamento.');
                }
                this.setDataValue('companyCnpj', digits);
            }
        },
        provider: {
            type: DataTypes.STRING(60),
            allowNull: false,
            set(value) {
                const normalized = normalizeKeySegment(value);
                if (!normalized) {
                    throw new Error('Nome do provedor inválido.');
                }
                this.setDataValue('provider', normalized);
            }
        },
        apiName: {
            type: DataTypes.STRING(60),
            allowNull: false,
            set(value) {
                const normalized = normalizeKeySegment(value);
                if (!normalized) {
                    throw new Error('Nome da API inválido.');
                }
                this.setDataValue('apiName', normalized);
            }
        },
        bankName: {
            type: DataTypes.STRING(120),
            allowNull: false,
            set(value) {
                const normalized = normalizeKeySegment(value);
                if (!normalized) {
                    throw new Error('Nome do banco inválido.');
                }
                this.setDataValue('bankName', normalized);
            }
        },
        integrationKey: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        encryptedToken: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        encryptionIv: {
            type: DataTypes.STRING(32),
            allowNull: false
        },
        encryptionAuthTag: {
            type: DataTypes.STRING(32),
            allowNull: false
        },
        tokenHash: {
            type: DataTypes.STRING(128),
            allowNull: false
        },
        tokenPreview: {
            type: DataTypes.STRING(32),
            allowNull: false
        }
    }, {
        tableName: 'PaymentGatewayTokens'
    });

    PaymentGatewayToken.normalizeKeySegment = normalizeKeySegment;
    PaymentGatewayToken.sanitizeDigits = sanitizeDigits;

    PaymentGatewayToken.associate = (models) => {
        if (models.Company) {
            PaymentGatewayToken.belongsTo(models.Company, {
                as: 'company',
                foreignKey: 'companyId',
                onDelete: 'CASCADE'
            });
        }
    };

    return PaymentGatewayToken;
};
