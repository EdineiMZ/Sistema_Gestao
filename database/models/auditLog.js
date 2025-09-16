'use strict';

module.exports = (sequelize, DataTypes) => {
    const AuditLog = sequelize.define('AuditLog', {
        userId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'Users',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
        },
        action: {
            type: DataTypes.STRING(120),
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Ação de auditoria é obrigatória.'
                }
            }
        },
        resource: {
            type: DataTypes.STRING(200),
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Recurso monitorado é obrigatório.'
                }
            }
        },
        ip: {
            type: DataTypes.STRING(45),
            allowNull: true,
            validate: {
                len: {
                    args: [0, 45],
                    msg: 'Endereço IP inválido.'
                }
            }
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        tableName: 'AuditLogs',
        timestamps: false,
        indexes: [
            {
                name: 'audit_logs_created_at_idx',
                fields: ['createdAt']
            },
            {
                name: 'audit_logs_action_idx',
                fields: ['action']
            },
            {
                name: 'audit_logs_user_idx',
                fields: ['userId']
            }
        ]
    });

    AuditLog.associate = (models) => {
        AuditLog.belongsTo(models.User, {
            as: 'user',
            foreignKey: 'userId'
        });
    };

    return AuditLog;
};
