const express = require('express');
const controller = require('../../controllers/rating.controller');
const { validateRatingInput } = require('../../middlewares/validators');

const router = express.Router({ mergeParams: true });

router.route('/create').post(validateRatingInput, controller.storeRating);

module.exports = router;
