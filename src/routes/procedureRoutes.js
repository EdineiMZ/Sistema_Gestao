// src/routes/procedureRoutes.js
const express = require('express');
const router = express.Router();

const procedureController = require('../controllers/procedureController');
const authMiddleware = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/authorize');
const { validateProcedure } = require('../middlewares/validateMiddleware');

// Permissão mínima: gestores
router.get('/', authMiddleware, authorize('manager'), procedureController.listProcedures);

router.get('/create', authMiddleware, authorize('manager'), procedureController.showCreate);

// Ao criar, chamamos validateProcedure
router.post(
    '/create',
    authMiddleware,
    authorize('manager'),
    validateProcedure,
    procedureController.createProcedure
);

router.get('/edit/:id', authMiddleware, authorize('manager'), procedureController.showEdit);

router.put(
    '/update/:id',
    authMiddleware,
    authorize('manager'),
    validateProcedure,
    procedureController.updateProcedure
);

router.delete(
    '/delete/:id',
    authMiddleware,
    authorize('manager'),
    procedureController.deleteProcedure
);

module.exports = router;
