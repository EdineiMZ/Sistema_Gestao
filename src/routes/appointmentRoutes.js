const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
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
router.get('/create', authMiddleware, permissionMiddleware(2), appointmentController.showCreate);
router.post('/create', authMiddleware, permissionMiddleware(2), appointmentController.createAppointment);

// rota p/ tela de edição
router.get('/edit/:id', authMiddleware, permissionMiddleware(2), appointmentController.showEdit);
router.put('/update/:id', authMiddleware, permissionMiddleware(2), appointmentController.updateAppointment);

router.delete('/delete/:id', authMiddleware, permissionMiddleware(2), appointmentController.deleteAppointment);

// Calendário gigante
router.get('/calendar', authMiddleware, permissionMiddleware(2), appointmentController.showCalendar);
router.get('/api/events', authMiddleware, permissionMiddleware(2), appointmentController.apiEvents);

module.exports = router;
