const express = require('express');
const controller = require('../../controllers/siwe.controller');

const router = express.Router({ mergeParams: true });

router.route('/create').post(controller.sendSiweMessage);

module.exports = router;
