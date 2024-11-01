const express = require('express');
const controller = require('../../controllers/stellar.controller');
const { validateCreationInput, validateChangeOpInput } = require('../../middlewares/validators');

const router = express.Router({ mergeParams: true });

router.route('/create').post(validateCreationInput, controller.createStellarTransaction);

router.route('/payment').post(validateChangeOpInput, controller.changeOpTransaction);

router.route('/sep10').post(controller.signSep10Challenge);

module.exports = router;
