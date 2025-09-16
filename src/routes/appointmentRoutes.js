const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const authorize = require('../middlewares/authorize');
const { createFilterValidation } = require('../middlewares/queryValidationMiddleware');
const { USER_ROLES } = require('../constants/roles');

const appointmentFiltersValidation = createFilterValidation({
    allowedStatuses: ['scheduled', 'completed', 'cancelled', 'no-show', 'pending-confirmation'],
    redirectTo: '/appointments'
});

// Especialistas (ou níveis superiores) podem listar/criar
router.get(
    '/',
    authMiddleware,
    permissionMiddleware(USER_ROLES.SPECIALIST),
    ...appointmentFiltersValidation,
    appointmentController.listAppointments
);

// nova rota p/ tela de criar
router.get('/create', authMiddleware, authorize(USER_ROLES.SPECIALIST), appointmentController.showCreate);
router.post('/create', authMiddleware, authorize(USER_ROLES.SPECIALIST), appointmentController.createAppointment);

// rota p/ tela de edição
router.get('/edit/:id', authMiddleware, authorize(USER_ROLES.SPECIALIST), appointmentController.showEdit);
router.put('/update/:id', authMiddleware, authorize(USER_ROLES.SPECIALIST), appointmentController.updateAppointment);

router.delete('/delete/:id', authMiddleware, authorize(USER_ROLES.SPECIALIST), appointmentController.deleteAppointment);

// Calendário gigante
router.get('/calendar', authMiddleware, authorize(USER_ROLES.SPECIALIST), appointmentController.showCalendar);
router.get('/api/events', authMiddleware, authorize(USER_ROLES.SPECIALIST), appointmentController.apiEvents);

module.exports = router;
