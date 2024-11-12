const express = require('express');
const controller = require('../../controllers/siwe.controller');
const { validateSiweCreate, validateSiweValidate } = require('../../middlewares/validators');

const router = express.Router({ mergeParams: true });

router.route('/create').post(validateSiweCreate, controller.sendSiweMessage);

router.route('/validate').post(validateSiweValidate, controller.validateSiweSignature);

module.exports = router;
