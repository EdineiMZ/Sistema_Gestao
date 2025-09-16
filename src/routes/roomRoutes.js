const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const authMiddleware = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/authorize');

router.get('/', authMiddleware, authorize('admin'), roomController.listRooms);
router.post('/create', authMiddleware, authorize('admin'), roomController.createRoom);
router.put('/update/:id', authMiddleware, authorize('admin'), roomController.updateRoom);
router.delete('/delete/:id', authMiddleware, authorize('admin'), roomController.deleteRoom);

module.exports = router;
