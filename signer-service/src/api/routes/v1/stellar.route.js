const express = require('express');
const controller = require('../../controllers/stellar.controller');
const { validateCreationInput, validateChangeOpInput, validateSep10Input } = require('../../middlewares/validators');

const router = express.Router({ mergeParams: true });

router.route('/create').post(validateCreationInput, controller.createStellarTransaction);

router.route('/payment').post(validateChangeOpInput, controller.changeOpTransaction);

router.route('/sep10').post(validateSep10Input, controller.signSep10Challenge);

module.exports = router;
