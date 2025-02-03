const express = require('express');
const controller = require('../../controllers/stellar.controller');
const { validateCreationInput, validateChangeOpInput, validateSep10Input } = require('../../middlewares/validators');
const { getMemoFromCookiesMiddleware } = require('../../middlewares/auth');

const router = express.Router({ mergeParams: true });

router.route('/create').post(validateCreationInput, controller.createStellarTransaction);

router.route('/payment').post(validateChangeOpInput, controller.changeOpTransaction);

// Only authorized route. Does not reject the request, but rather passes the memo (if any) derived from a valid cookie in the request.
router.route('/sep10').post([validateSep10Input, getMemoFromCookiesMiddleware], controller.signSep10Challenge);

router.route('/sep10').get(controller.getSep10MasterPK);

module.exports = router;
