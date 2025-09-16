// src/middlewares/permissionMiddleware.js
// Mantido por compatibilidade: utiliza o novo middleware authorize internamente
const authorize = require('./authorize');

module.exports = (requiredRole) => authorize(requiredRole);
