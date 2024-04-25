const express = require('express');
const controller = require('../../controllers/token.controller');
const { validateCreationInput, validateChangeOpInput } = require('../../middlewares/validators');

const router = express.Router({ mergeParams: true });

router.route('/create').post(validateCreationInput, controller.createStellarTransaction);

router.route('/payment').post(validateChangeOpInput, controller.changeOpTransaction);

module.exports = router;
