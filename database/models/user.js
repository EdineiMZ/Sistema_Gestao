'use strict';
const bcrypt = require('bcrypt');
const { USER_ROLES, ROLE_ORDER, parseRole } = require('../../src/constants/roles');

module.exports = (sequelize, DataTypes) => {
    const User = sequelize.define('User', {
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Nome é obrigatório.'
                },
                len: {
                    args: [3, 120],
                    msg: 'Nome deve conter entre 3 e 120 caracteres.'
                }
            }
        },
        email: {
            type: DataTypes.STRING,
            unique: true,
            allowNull: false,
            validate: {
                isEmail: {
                    msg: 'E-mail inválido.'
                }
            }
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Senha é obrigatória.'
                },
                len: {
                    args: [6, 255],
                    msg: 'Senha deve conter ao menos 6 caracteres.'
                }
            }
        },
        phone: {
            type: DataTypes.STRING,
            allowNull: true,
            validate: {
                len: {
                    args: [0, 20],
                    msg: 'Telefone deve conter no máximo 20 caracteres.'
                }
            }
        },
        address: {
            type: DataTypes.STRING,
            allowNull: true,
            validate: {
                len: {
                    args: [0, 255],
                    msg: 'Endereço deve conter no máximo 255 caracteres.'
                }
            }
        },
        dateOfBirth: {
            type: DataTypes.DATEONLY,
            allowNull: true,
            validate: {
                isDate: {
                    msg: 'Data de nascimento inválida.'
                }
            }
        },
        role: {
            type: DataTypes.ENUM(...ROLE_ORDER),
            defaultValue: USER_ROLES.CLIENT,
            allowNull: false,
            set(value) {
                if (value === undefined || value === null || value === '') {
                    this.setDataValue('role', USER_ROLES.CLIENT);
                    return;
                }

                const resolvedRole = parseRole(value, null);
                if (!resolvedRole) {
                    throw new Error('Função de usuário inválida.');
                }

                this.setDataValue('role', resolvedRole);
            },
            validate: {
                isIn: {
                    args: [ROLE_ORDER],
                    msg: 'Função de usuário inválida.'
                }
            }
        },
        active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        profileImage: {
            type: DataTypes.BLOB('long'),
            allowNull: true
        },
        creditBalance: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00,
            validate: {
                min: {
                    args: [0],
                    msg: 'Crédito não pode ser negativo.'
                }
            }
        }
    }, {
        tableName: 'Users',
        hooks: {
            beforeCreate: async (user) => {
                if (!user.password) {
                    throw new Error('Senha é obrigatória.');
                }
                const salt = await bcrypt.genSalt(10);
                user.password = await bcrypt.hash(user.password, salt);
            },
            beforeUpdate: async (user) => {
                if (user.changed('password')) {
                    const salt = await bcrypt.genSalt(10);
                    user.password = await bcrypt.hash(user.password, salt);
                }
            }
        },
        defaultScope: {
            attributes: { exclude: ['createdAt', 'updatedAt'] }
        },
        scopes: {
            withSensitive: {
                attributes: { include: ['password'] }
            }
        }
    });

    User.prototype.getFirstName = function () {
        if (!this.name) return '';
        return this.name.split(' ')[0];
    };

    return User;
};
