'use strict';

const normalizeSlug = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    const stringValue = String(value).trim().toLowerCase();
    if (!stringValue) {
        return null;
    }

    const sanitized = stringValue
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    return sanitized || null;
};

const normalizeColor = (value) => {
    if (!value) {
        return '#6c757d';
    }

    const stringValue = String(value).trim();
    if (!stringValue) {
        return '#6c757d';
    }

    if (stringValue.startsWith('#')) {
        return stringValue.toLowerCase();
    }

    return `#${stringValue.toLowerCase()}`;
};

const HEX_COLOR_REGEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

module.exports = (sequelize, DataTypes) => {
    const FinanceCategory = sequelize.define('FinanceCategory', {
        name: {
            type: DataTypes.STRING(120),
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Nome da categoria é obrigatório.'
                },
                len: {
                    args: [2, 120],
                    msg: 'Nome da categoria deve conter entre 2 e 120 caracteres.'
                }
            }
        },
        slug: {
            type: DataTypes.STRING(120),
            allowNull: false,
            unique: false,
            validate: {
                notEmpty: {
                    msg: 'Slug é obrigatório.'
                },
                isValidSlug(value) {
                    if (!value) {
                        throw new Error('Slug é obrigatório.');
                    }

                    if (!/^[a-z0-9-]+$/.test(value)) {
                        throw new Error('Slug deve conter apenas letras, números e hifens.');
                    }
                }
            },
            set(value) {
                const normalized = normalizeSlug(value);
                if (!normalized) {
                    throw new Error('Slug é obrigatório.');
                }
                this.setDataValue('slug', normalized);
            }
        },
        color: {
            type: DataTypes.STRING(9),
            allowNull: false,
            defaultValue: '#6c757d',
            validate: {
                isHex(value) {
                    if (!value) {
                        throw new Error('Cor é obrigatória.');
                    }
                    if (!HEX_COLOR_REGEX.test(value)) {
                        throw new Error('Cor deve estar no formato hexadecimal (#RRGGBB ou #RGB).');
                    }
                }
            },
            set(value) {
                const normalized = normalizeColor(value);
                this.setDataValue('color', normalized);
            }
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        ownerId: {
            type: DataTypes.INTEGER,
            allowNull: true
        }
    }, {
        tableName: 'FinanceCategories',
        indexes: [
            {
                name: 'finance_categories_owner_slug_unique',
                unique: true,
                fields: ['ownerId', 'slug']
            },
            {
                name: 'finance_categories_owner_idx',
                fields: ['ownerId']
            }
        ],
        defaultScope: {
            where: { isActive: true }
        },
        scopes: {
            all: {
                where: {}
            },
            active: {
                where: { isActive: true }
            },
            inactive: {
                where: { isActive: false }
            }
        }
    });

    FinanceCategory.normalizeSlug = normalizeSlug;

    FinanceCategory.associate = (models) => {
        FinanceCategory.belongsTo(models.User, {
            as: 'owner',
            foreignKey: 'ownerId'
        });

        if (models.FinanceEntry) {
            FinanceCategory.hasMany(models.FinanceEntry, {
                as: 'entries',
                foreignKey: 'financeCategoryId'
            });
        }

        if (models.Budget) {
            FinanceCategory.hasMany(models.Budget, {
                as: 'budgets',
                foreignKey: 'financeCategoryId'
            });
        }
    };

    return FinanceCategory;
};
