const express = require('express');
const controller = require('../../controllers/storage.controller');
const { validateStorageInput } = require('../../middlewares/validators');

const router = express.Router({ mergeParams: true });

router.route('/create').post(validateStorageInput, controller.storeData);

module.exports = router;
