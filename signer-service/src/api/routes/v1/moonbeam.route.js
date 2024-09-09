const express = require('express');

const { executeXcmControlller } = require('../../controllers/moonbeam.controller');
const { validateExecuteXCM } = require('../../middlewares/validators');

const router = express.Router();

router.post('/execute-xcm', validateExecuteXCM, executeXcmControlller);

module.exports = router;
