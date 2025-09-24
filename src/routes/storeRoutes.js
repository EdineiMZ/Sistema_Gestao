const express = require('express');

const storefrontController = require('../controllers/storefrontController');

const router = express.Router();

router.get('/', storefrontController.listStores);
router.get('/:slug', storefrontController.showStore);

module.exports = router;
