const express = require('express');

const stellarRoutes = require('./stellar.route');
const pendulumRoutes = require('./pendulum.route');
const storageRoutes = require('./storage.route');
const subsidizeRoutes = require('./subsidize.route');

const router = express.Router({ mergeParams: true });
const { sendStatusWithPk: sendStellarStatusWithPk } = require('../../services/stellar.service');
const { sendStatusWithPk: sendPendulumStatusWithPk } = require('../../services/pendulum.service');

async function sendStatusWithPk(req, res, next) {
  const stellar = await sendStellarStatusWithPk();
  const pendulum = await sendPendulumStatusWithPk();

  res.json({
    stellar,
    pendulum,
  });
}
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
router.use('/pendulum', pendulumRoutes);

/**
 * POST v1/storage
 */
router.use('/storage', storageRoutes);

router.use('/subsidize', subsidizeRoutes);

module.exports = router;
