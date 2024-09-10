const express = require('express');

const { executeXcmController } = require('../../controllers/moonbeam.controller');
const { validateExecuteXCM } = require('../../middlewares/validators');

const router = express.Router();

router.post('/execute-xcm', validateExecuteXCM, executeXcmController);

module.exports = router;
