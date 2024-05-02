const express = require('express');
const httpStatus = require('http-status');
const stellarRoutes = require('./stellar.route');

const router = express.Router({ mergeParams: true });
const { sendStatusWithPk } = require('../../controllers/stellar.controller');

/**
 * GET v1/status
 */
router.get('/status', sendStatusWithPk);

/**
 * GET v1/docs
 */
// Don't show docs for now.
// router.use("/docs", express.static("docs"));

/**
 * POST v1/stellar
 */
router.use('/stellar', stellarRoutes);

module.exports = router;
