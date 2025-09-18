'use strict';

module.exports = (sequelize, DataTypes) => {
    const Procedure = sequelize.define('Procedure', {
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Nome do procedimento é obrigatório.'
                },
                len: {
                    args: [2, 120],
                    msg: 'Nome deve conter entre 2 e 120 caracteres.'
                }
            }
        },
        active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        price: {
            type: DataTypes.DECIMAL(10,2),
            allowNull: false,
            validate: {
                min: {
                    args: [0],
                    msg: 'Preço precisa ser positivo.'
                }
            }
        },
        requiresRoom: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        roomId: {
            type: DataTypes.INTEGER,
            allowNull: true // se exige sala, associe
        },
        estimatedTime: {
            type: DataTypes.INTEGER, // em minutos
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Tempo estimado inválido.'
                }
            }
        },
        commissionType: {
            type: DataTypes.STRING, // 'percent' ou 'value'
            allowNull: true,
            validate: {
                isValidType(value) {
                    if (!value) return;
                    if (!['percent', 'value'].includes(value)) {
                        throw new Error('Tipo de comissão inválido.');
                    }
                }
            }
        },
        commissionValue: {
            type: DataTypes.DECIMAL(10,2),
            allowNull: true,
            validate: {
                min: {
                    args: [0],
                    msg: 'Valor de comissão inválido.'
                }
            }
        },
        createdBy: {
            type: DataTypes.INTEGER, // user.id que cadastrou
            allowNull: true
        }
    }, {
        tableName: 'Procedures'
    });

    return Procedure;
};
