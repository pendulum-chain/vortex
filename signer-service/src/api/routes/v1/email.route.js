const express = require('express');
const controller = require('../../controllers/email.controller');
const { validateEmailInput } = require('../../middlewares/validators');

const router = express.Router({ mergeParams: true });

router.route('/create').post(validateEmailInput, controller.storeEmail);

module.exports = router;
