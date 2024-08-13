const express = require('express');
const controller = require('../../controllers/stellar.controller');
const { validateCreationInput, validateChangeOpInput } = require('../../middlewares/validators');

const router = express.Router({ mergeParams: true });

router.route('/preswap').post(validateCreationInput, controller.createStellarTransaction);

router.route('/postswap').post(validateChangeOpInput, controller.changeOpTransaction);

module.exports = router;
