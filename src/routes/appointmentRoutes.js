const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const authorize = require('../middlewares/authorize');
const { createFilterValidation } = require('../middlewares/queryValidationMiddleware');

const appointmentFiltersValidation = createFilterValidation({
    allowedStatuses: ['scheduled', 'completed', 'cancelled', 'no-show', 'pending-confirmation'],
    redirectTo: '/appointments'
});

// role >= 2 para listar/criar
router.get(
    '/',
    authMiddleware,
    permissionMiddleware(2),
    ...appointmentFiltersValidation,
    appointmentController.listAppointments
);

// nova rota p/ tela de criar
router.get('/create', authMiddleware, authorize('specialist'), appointmentController.showCreate);
router.post('/create', authMiddleware, authorize('specialist'), appointmentController.createAppointment);

// rota p/ tela de edição
router.get('/edit/:id', authMiddleware, authorize('specialist'), appointmentController.showEdit);
router.put('/update/:id', authMiddleware, authorize('specialist'), appointmentController.updateAppointment);

router.delete('/delete/:id', authMiddleware, authorize('specialist'), appointmentController.deleteAppointment);

// Calendário gigante
router.get('/calendar', authMiddleware, authorize('specialist'), appointmentController.showCalendar);
router.get('/api/events', authMiddleware, authorize('specialist'), appointmentController.apiEvents);

module.exports = router;
