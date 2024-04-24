const express = require("express");
const httpStatus = require("http-status");
const statsRoutes = require("./stats.route");

const router = express.Router({ mergeParams: true });

/**
 * GET v1/status
 */
router.get("/status", (req, res) => res.send(httpStatus.OK));

/**
 * GET v1/docs
 */
// Don't show docs for now.
// router.use("/docs", express.static("docs"));

/**
 * POST v1/stellar
 */
router.use("/stellar", statsRoutes);

module.exports = router;
