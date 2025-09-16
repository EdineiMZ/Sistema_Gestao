'use strict';
module.exports = (sequelize, DataTypes) => {
    const FinanceEntry = sequelize.define('FinanceEntry', {
        description: DataTypes.STRING,
        type: { // 'payable' ou 'receivable'
            type: DataTypes.STRING,
            allowNull: false
        },
        value: {
            type: DataTypes.DECIMAL(10,2),
            allowNull: false
        },
        dueDate: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        paymentDate: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        status: {
            type: DataTypes.STRING, // 'pending', 'paid', 'overdue'
            defaultValue: 'pending'
        },
        // Campos extras para automação
        recurring: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        recurringInterval: {
            type: DataTypes.STRING // 'monthly', 'weekly', etc.
        }
    }, {
        tableName: 'FinanceEntries'
    });

    return FinanceEntry;
};
