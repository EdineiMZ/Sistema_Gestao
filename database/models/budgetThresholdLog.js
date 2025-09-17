'use strict';

const normalizeThreshold = (value) => {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
        return null;
    }

    const rounded = Number(parsed.toFixed(4));
    if (rounded <= 0 || rounded > 1) {
        return null;
    }

    return rounded;
};

module.exports = (sequelize, DataTypes) => {
    const BudgetThresholdLog = sequelize.define('BudgetThresholdLog', {
        budgetId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        referenceMonth: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        threshold: {
            type: DataTypes.DECIMAL(5, 4),
            allowNull: false,
            set(value) {
                const normalized = normalizeThreshold(value);
                if (normalized === null) {
                    throw new Error('Valor de limiar inválido.');
                }
                this.setDataValue('threshold', normalized);
            }
        },
        consumptionValue: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false
        },
        limitValue: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false
        },
        triggeredAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        tableName: 'BudgetThresholdLogs'
    });

    BudgetThresholdLog.normalizeThreshold = normalizeThreshold;

    BudgetThresholdLog.associate = (models) => {
        BudgetThresholdLog.belongsTo(models.Budget, {
            as: 'budget',
            foreignKey: 'budgetId',
            onDelete: 'CASCADE'
        });
    };

    return BudgetThresholdLog;
};
