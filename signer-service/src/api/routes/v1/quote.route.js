const express = require('express');
const controller = require('../../controllers/quote.controller');
const { validateQuoteInput } = require('../../middlewares/validators');

const router = express.Router({ mergeParams: true });

router.route('/').get(validateQuoteInput, controller.getQuoteForProvider);

module.exports = router;
