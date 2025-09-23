'use strict';

const DEFAULT_POLICY_KEY = 'finance_access';

const toPlainArray = (value) => {
    if (Array.isArray(value)) {
        return value;
    }

    if (value === undefined || value === null) {
        return [];
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return [];
        }

        try {
            const parsed = JSON.parse(trimmed);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return trimmed
                .split(/[,;|\s]+/)
                .map((item) => item.trim())
                .filter(Boolean);
        }
    }

    return [];
};

module.exports = (sequelize, DataTypes) => {
    const FinanceAccessPolicy = sequelize.define('FinanceAccessPolicy', {
        policyKey: {
            type: DataTypes.STRING(100),
            allowNull: false,
            defaultValue: DEFAULT_POLICY_KEY
        },
        allowedRoles: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: '[]',
            get() {
                const rawValue = this.getDataValue('allowedRoles');
                return toPlainArray(rawValue);
            },
            set(value) {
                const plain = toPlainArray(value);
                this.setDataValue('allowedRoles', JSON.stringify(plain));
            }
        },
        updatedById: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        updatedByName: {
            type: DataTypes.STRING(255),
            allowNull: true
        }
    }, {
        tableName: 'FinanceAccessPolicies'
    });

    FinanceAccessPolicy.associate = (models) => {
        if (models.User) {
            FinanceAccessPolicy.belongsTo(models.User, {
                as: 'updatedBy',
                foreignKey: 'updatedById'
            });
        }
    };

    FinanceAccessPolicy.DEFAULT_POLICY_KEY = DEFAULT_POLICY_KEY;

    return FinanceAccessPolicy;
};
