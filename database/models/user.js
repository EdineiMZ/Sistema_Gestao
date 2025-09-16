'use strict';
const bcrypt = require('bcrypt');

module.exports = (sequelize, DataTypes) => {
    const User = sequelize.define('User', {
        name: DataTypes.STRING,
        email: {
            type: DataTypes.STRING,
            unique: true,
            allowNull: false
        },
        password: DataTypes.STRING,
        phone: DataTypes.STRING,
        address: DataTypes.STRING,
        dateOfBirth: DataTypes.DATEONLY,
        role: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        profileImage: {
            type: DataTypes.BLOB('long'),
            allowNull: true
        },
        // Campo para desconto ou crédito (por exemplo, valor em R$)
        creditBalance: {
            type: DataTypes.DECIMAL(10,2),
            allowNull: false,
            defaultValue: 0.00
        }
    }, {
        tableName: 'Users',
        hooks: {
            beforeCreate: async (user) => {
                const salt = await bcrypt.genSalt(10);
                user.password = await bcrypt.hash(user.password, salt);
            },
            beforeUpdate: async (user) => {
                if (user.changed('password')) {
                    const salt = await bcrypt.genSalt(10);
                    user.password = await bcrypt.hash(user.password, salt);
                }
            }
        }
    });

    return User;
};
