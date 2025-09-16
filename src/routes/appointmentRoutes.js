const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const authMiddleware = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/authorize');

// Requer perfil de especialista ou superior para listar/criar
router.get('/', authMiddleware, authorize('specialist'), appointmentController.listAppointments);
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
