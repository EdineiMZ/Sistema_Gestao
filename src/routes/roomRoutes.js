const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');

router.get('/', authMiddleware, permissionMiddleware(4), roomController.listRooms);
router.post('/create', authMiddleware, permissionMiddleware(4), roomController.createRoom);
router.put('/update/:id', authMiddleware, permissionMiddleware(4), roomController.updateRoom);
router.delete('/delete/:id', authMiddleware, permissionMiddleware(4), roomController.deleteRoom);

module.exports = router;
