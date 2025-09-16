// src/routes/procedureRoutes.js
const express = require('express');
const router = express.Router();

const procedureController = require('../controllers/procedureController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const { validateProcedure } = require('../middlewares/validateMiddleware');

// Se a permissão mínima é role >= 3
router.get('/', authMiddleware, permissionMiddleware(3), procedureController.listProcedures);

router.get('/create', authMiddleware, permissionMiddleware(3), procedureController.showCreate);

// Ao criar, chamamos validateProcedure
router.post(
    '/create',
    authMiddleware,
    permissionMiddleware(3),
    validateProcedure,
    procedureController.createProcedure
);

router.get('/edit/:id', authMiddleware, permissionMiddleware(3), procedureController.showEdit);

router.put(
    '/update/:id',
    authMiddleware,
    permissionMiddleware(3),
    validateProcedure,
    procedureController.updateProcedure
);

router.delete(
    '/delete/:id',
    authMiddleware,
    permissionMiddleware(3),
    procedureController.deleteProcedure
);

module.exports = router;
