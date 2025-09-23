const express = require('express');
const companyController = require('../controllers/companyController');
const authMiddleware = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/authorize');
const { USER_ROLES } = require('../constants/roles');

const router = express.Router();

router.use(authMiddleware);
router.use(authorize(USER_ROLES.ADMIN));

router.get('/', companyController.list);
router.get('/new', companyController.showCreateForm);
router.post('/', companyController.create);
router.get('/:id/edit', companyController.showEditForm);
router.put('/:id', companyController.update);
router.delete('/:id', companyController.remove);

router.post('/lookup', companyController.lookupByCnpj);
router.get('/:id/users', companyController.manageUsers);
router.post('/:id/users', companyController.attachUser);
router.put('/:id/users/:userId', companyController.updateUserAccess);
router.delete('/:id/users/:userId', companyController.detachUser);

module.exports = router;
