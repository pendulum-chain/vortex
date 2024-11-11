const express = require('express');
const controller = require('../../controllers/siwe.controller');

const router = express.Router({ mergeParams: true });

router.route('/create').post(controller.sendSiweMessage);

router.route('/validate').post(controller.validateSiweSignature);

module.exports = router;
