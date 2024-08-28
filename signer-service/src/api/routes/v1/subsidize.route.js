const express = require('express');
const controller = require('../../controllers/subsidize.controller');
const {
  validatePreSwapSubsidizationInput,
  validatePostSwapSubsidizationInput,
} = require('../../middlewares/validators');

const router = express.Router({ mergeParams: true });

router.route('/preswap').post(validatePreSwapSubsidizationInput, controller.subsidizePreSwap);
router.route('/postswap').post(validatePostSwapSubsidizationInput, controller.subsidizePostSwap);

module.exports = router;
