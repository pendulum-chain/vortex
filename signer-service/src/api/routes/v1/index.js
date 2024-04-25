const express = require('express');
const httpStatus = require('http-status');
const statsRoutes = require('./stats.route');

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
router.use('/stellar', statsRoutes);

module.exports = router;
