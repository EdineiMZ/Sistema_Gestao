'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';
const config = require('../../config/config')[env] || {};
const db = {};

let sequelize;

if (config.use_env_variable) {
    sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else if ((config.dialect || '').toLowerCase() === 'sqlite') {
    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: config.storage || ':memory:',
        logging: config.logging ?? false,
        define: config.define,
        pool: config.pool
    });
} else {
    sequelize = new Sequelize(
        config.database,
        config.username,
        config.password,
        {
            host: config.host,
            dialect: config.dialect,
            port: config.port,
            logging: config.logging ?? false,
            define: config.define,
            pool: config.pool,
            dialectOptions: config.dialectOptions
        }
    );
}

// Carrega todos os arquivos de model *.js, exceto este index.js
fs
    .readdirSync(__dirname)
    .filter(file => {
        return (
            file.indexOf('.') !== 0 &&
            file !== basename &&
            file.slice(-3) === '.js'
        );
    })
    .forEach(file => {
        const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
        db[model.name] = model;
    });

Object.keys(db).forEach(modelName => {
    if (db[modelName].associate) {
        db[modelName].associate(db);
    }
});

// --- Início das associações manuais ---
const {
    User,
    Appointment,
    Room,
    Procedure,
    FinanceCategory,
    FinanceEntry,
    Budget,
    BudgetThresholdStatus,
    SupportTicket,
    SupportMessage,
    SupportAttachment
} = db;

/**
 * Exemplo de associações:
 * Appointment.belongsTo(User, { as: 'professional', foreignKey: 'professionalId' });
 * Appointment.belongsTo(Room, { as: 'room', foreignKey: 'roomId' });
 * Procedure.belongsTo(Room, { as: 'room', foreignKey: 'roomId' });
 * Appointment.belongsTo(Procedure, { as: 'procedure', foreignKey: 'procedureId' });
 */

// Appointment -> User (profissional)
if (User && Appointment) {
    Appointment.belongsTo(User, {
        as: 'professional',
        foreignKey: 'professionalId'
    });
    User.hasMany(Appointment, {
        as: 'appointments',
        foreignKey: 'professionalId'
    });
}

// Appointment -> Room
if (Room && Appointment) {
    Appointment.belongsTo(Room, {
        as: 'room',
        foreignKey: 'roomId'
    });
    Room.hasMany(Appointment, {
        as: 'appointments',
        foreignKey: 'roomId'
    });
}

// Procedure -> Room (se "requiresRoom" for verdadeiro e tiver roomId)
if (Procedure && Room) {
    Procedure.belongsTo(Room, {
        as: 'room',
        foreignKey: 'roomId'
    });
    Room.hasMany(Procedure, {
        as: 'procedures',
        foreignKey: 'roomId'
    });
}

// Appointment -> Procedure
if (Procedure && Appointment) {
    Appointment.belongsTo(Procedure, {
        as: 'procedure',
        foreignKey: 'procedureId'
    });
    Procedure.hasMany(Appointment, {
        as: 'appointments',
        foreignKey: 'procedureId'
    });
}

// --- Fim das associações manuais ---

if (Budget && User && !(Budget.associations && Budget.associations.user)) {
    Budget.belongsTo(User, {
        as: 'user',
        foreignKey: 'userId'
    });
}

if (Budget && FinanceCategory && !(Budget.associations && Budget.associations.category)) {
    Budget.belongsTo(FinanceCategory, {
        as: 'category',
        foreignKey: 'financeCategoryId'
    });
}

if (Budget && BudgetThresholdStatus && !(Budget.associations && Budget.associations.thresholdStatuses)) {
    Budget.hasMany(BudgetThresholdStatus, {
        as: 'thresholdStatuses',
        foreignKey: 'budgetId',
        onDelete: 'CASCADE'
    });
}

if (BudgetThresholdStatus && Budget && !(BudgetThresholdStatus.associations && BudgetThresholdStatus.associations.budget)) {
    BudgetThresholdStatus.belongsTo(Budget, {
        as: 'budget',
        foreignKey: 'budgetId',
        onDelete: 'CASCADE'
    });
}

if (FinanceCategory && Budget && !(FinanceCategory.associations && FinanceCategory.associations.budgets)) {
    FinanceCategory.hasMany(Budget, {
        as: 'budgets',
        foreignKey: 'financeCategoryId'
    });
}

if (FinanceCategory && FinanceEntry && !(FinanceCategory.associations && FinanceCategory.associations.entries)) {
    FinanceCategory.hasMany(FinanceEntry, {
        as: 'entries',
        foreignKey: 'financeCategoryId'
    });
}

if (FinanceEntry && FinanceCategory && !(FinanceEntry.associations && FinanceEntry.associations.category)) {
    FinanceEntry.belongsTo(FinanceCategory, {
        as: 'category',
        foreignKey: 'financeCategoryId'
    });
}

if (SupportTicket && User && !(SupportTicket.associations && SupportTicket.associations.creator)) {
    SupportTicket.belongsTo(User, {
        as: 'creator',
        foreignKey: 'creatorId',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
    });
}

if (SupportTicket && User && !(SupportTicket.associations && SupportTicket.associations.assignee)) {
    SupportTicket.belongsTo(User, {
        as: 'assignee',
        foreignKey: 'assignedToId',
        constraints: false,
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
    });
}

if (SupportTicket && SupportMessage && !(SupportTicket.associations && SupportTicket.associations.messages)) {
    SupportTicket.hasMany(SupportMessage, {
        as: 'messages',
        foreignKey: 'ticketId',
        onDelete: 'CASCADE'
    });
}

if (SupportTicket && SupportAttachment && !(SupportTicket.associations && SupportTicket.associations.attachments)) {
    SupportTicket.hasMany(SupportAttachment, {
        as: 'attachments',
        foreignKey: 'ticketId',
        onDelete: 'CASCADE'
    });
}

if (SupportMessage && SupportTicket && !(SupportMessage.associations && SupportMessage.associations.ticket)) {
    SupportMessage.belongsTo(SupportTicket, {
        as: 'ticket',
        foreignKey: 'ticketId',
        onDelete: 'CASCADE'
    });
}

if (SupportMessage && User && !(SupportMessage.associations && SupportMessage.associations.sender)) {
    SupportMessage.belongsTo(User, {
        as: 'sender',
        foreignKey: 'senderId'
    });
}

if (SupportAttachment && SupportTicket && !(SupportAttachment.associations && SupportAttachment.associations.ticket)) {
    SupportAttachment.belongsTo(SupportTicket, {
        as: 'ticket',
        foreignKey: 'ticketId',
        onDelete: 'CASCADE'
    });
}

if (SupportMessage && SupportAttachment && !(SupportMessage.associations && SupportMessage.associations.attachments)) {
    SupportMessage.hasMany(SupportAttachment, {
        as: 'attachments',
        foreignKey: 'messageId',
        onDelete: 'CASCADE'
    });
}

if (SupportAttachment && SupportMessage && !(SupportAttachment.associations && SupportAttachment.associations.message)) {
    SupportAttachment.belongsTo(SupportMessage, {
        as: 'message',
        foreignKey: 'messageId',
        onDelete: 'CASCADE'
    });
}


db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
