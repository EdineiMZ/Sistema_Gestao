'use strict';
const argon2 = require('argon2');
const { USER_ROLES, ROLE_ORDER, parseRole } = require('../../src/constants/roles');

const parsePositiveInt = (value, fallback) => {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const ARGON2_OPTIONS = {
    type: argon2.argon2id,
    timeCost: parsePositiveInt(process.env.ARGON2_TIME_COST, 3),
    memoryCost: parsePositiveInt(process.env.ARGON2_MEMORY_COST, 2 ** 16),
    parallelism: parsePositiveInt(process.env.ARGON2_PARALLELISM, 1)
};

const hashPassword = async (user) => {
    if (!user.password) {
        throw new Error('Senha é obrigatória.');
    }

    user.password = await argon2.hash(user.password, ARGON2_OPTIONS);
};

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
        },
        emailVerifiedAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        emailVerificationTokenHash: {
            type: DataTypes.STRING(128),
            allowNull: true,
            validate: {
                len: {
                    args: [10, 128],
                    msg: 'Hash de verificação de e-mail inválido.'
                }
            }
        },
        emailVerificationTokenExpiresAt: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        tableName: 'Users',
        hooks: {
            beforeCreate: async (user) => {
                await hashPassword(user);
            },
            beforeUpdate: async (user) => {
                if (user.changed('password')) {
                    await hashPassword(user);
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

    User.associate = (models) => {
        User.hasOne(models.UserNotificationPreference, {
            as: 'notificationPreference',
            foreignKey: 'userId',
            onDelete: 'CASCADE',
            hooks: true
        });
    };

    return User;
};
