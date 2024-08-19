const express = require('express');
const { fundEphemeralAccountController } = require('../../controllers/pendulum.controller');

const router = express.Router();

router.post('/fundEphemeral', fundEphemeralAccountController);

module.exports = router;
