'use strict';

const sanitizeDigits = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    const digits = String(value).replace(/\D+/g, '');
    return digits.length ? digits : null;
};

const validateCnpj = (value) => {
    if (!value) {
        throw new Error('CNPJ é obrigatório.');
    }

    const digits = sanitizeDigits(value);
    if (!digits || digits.length !== 14) {
        throw new Error('CNPJ deve conter 14 dígitos.');
    }

    return digits;
};

module.exports = (sequelize, DataTypes) => {
    const Company = sequelize.define('Company', {
        cnpj: {
            type: DataTypes.STRING(14),
            allowNull: false,
            unique: true,
            set(value) {
                const sanitized = sanitizeDigits(value);
                this.setDataValue('cnpj', sanitized);
            },
            validate: {
                isValid(value) {
                    validateCnpj(value);
                }
            }
        },
        corporateName: {
            type: DataTypes.STRING(180),
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Razão social é obrigatória.'
                },
                len: {
                    args: [3, 180],
                    msg: 'Razão social deve conter entre 3 e 180 caracteres.'
                }
            }
        },
        tradeName: {
            type: DataTypes.STRING(180),
            allowNull: true,
            validate: {
                len: {
                    args: [0, 180],
                    msg: 'Nome fantasia deve conter até 180 caracteres.'
                }
            }
        },
        stateRegistration: {
            type: DataTypes.STRING(30),
            allowNull: true,
            validate: {
                len: {
                    args: [0, 30],
                    msg: 'Inscrição estadual deve conter até 30 caracteres.'
                }
            }
        },
        municipalRegistration: {
            type: DataTypes.STRING(30),
            allowNull: true,
            validate: {
                len: {
                    args: [0, 30],
                    msg: 'Inscrição municipal deve conter até 30 caracteres.'
                }
            }
        },
        taxRegime: {
            type: DataTypes.STRING(60),
            allowNull: true,
            validate: {
                len: {
                    args: [0, 60],
                    msg: 'Regime tributário deve conter até 60 caracteres.'
                }
            }
        },
        email: {
            type: DataTypes.STRING(160),
            allowNull: true,
            validate: {
                isEmail: {
                    msg: 'E-mail de contato inválido.'
                }
            }
        },
        phone: {
            type: DataTypes.STRING(20),
            allowNull: true,
            validate: {
                len: {
                    args: [0, 20],
                    msg: 'Telefone deve conter até 20 caracteres.'
                }
            }
        },
        mobilePhone: {
            type: DataTypes.STRING(20),
            allowNull: true,
            validate: {
                len: {
                    args: [0, 20],
                    msg: 'Celular deve conter até 20 caracteres.'
                }
            }
        },
        website: {
            type: DataTypes.STRING(200),
            allowNull: true,
            validate: {
                isUrl: {
                    msg: 'Website inválido.'
                }
            }
        },
        openingDate: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        zipCode: {
            type: DataTypes.STRING(8),
            allowNull: true,
            set(value) {
                const digits = sanitizeDigits(value);
                this.setDataValue('zipCode', digits);
            },
            validate: {
                len: {
                    args: [0, 8],
                    msg: 'CEP deve conter 8 dígitos.'
                }
            }
        },
        addressLine: {
            type: DataTypes.STRING(200),
            allowNull: true
        },
        number: {
            type: DataTypes.STRING(20),
            allowNull: true
        },
        complement: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        neighborhood: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        city: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        state: {
            type: DataTypes.STRING(2),
            allowNull: true,
            set(value) {
                const normalized = typeof value === 'string' ? value.trim().toUpperCase() : null;
                this.setDataValue('state', normalized || null);
            },
            validate: {
                len: {
                    args: [0, 2],
                    msg: 'UF deve conter 2 caracteres.'
                }
            }
        },
        country: {
            type: DataTypes.STRING(60),
            allowNull: true,
            defaultValue: 'Brasil'
        },
        status: {
            type: DataTypes.ENUM('active', 'inactive'),
            allowNull: false,
            defaultValue: 'active'
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        tableName: 'Companies',
        paranoid: false,
        indexes: [
            {
                unique: true,
                fields: ['cnpj']
            },
            {
                fields: ['corporateName']
            },
            {
                fields: ['status']
            }
        ]
    });

    Company.beforeValidate((company) => {
        if (company.cnpj) {
            company.cnpj = validateCnpj(company.cnpj);
        }
    });

    Company.associate = (models) => {
        if (models.User) {
            Company.hasMany(models.User, {
                as: 'users',
                foreignKey: 'companyId'
            });
        }
    };

    return Company;
};
