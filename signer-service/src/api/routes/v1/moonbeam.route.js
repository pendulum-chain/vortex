const express = require('express');
const { executeXcmControlller } = require('../../controllers/moonbeam.controller');

const router = express.Router();

router.post('/execute-xcm', executeXcmControlller);

module.exports = router;
