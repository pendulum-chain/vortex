const express = require('express');

const stellarRoutes = require('./stellar.route');
const moonbeamRoutes = require('./moonbeam.route');
const pendulumRoutes = require('./pendulum.route');
const storageRoutes = require('./storage.route');
const emailRoutes = require('./email.route');
const ratingRoutes = require('./rating.route');
const subsidizeRoutes = require('./subsidize.route');

const router = express.Router({ mergeParams: true });
const { sendStatusWithPk: sendStellarStatusWithPk } = require('../../services/stellar.service');
const { sendStatusWithPk: sendPendulumStatusWithPk } = require('../../services/pendulum.service');
const { sendStatusWithPk: sendMoonbeamStatusWithPk } = require('../../controllers/moonbeam.controller');

async function sendStatusWithPk(req, res, next) {
  const stellar = await sendStellarStatusWithPk();
  const pendulum = await sendPendulumStatusWithPk();
  const moonbeam = await sendMoonbeamStatusWithPk();

  res.json({
    stellar,
    pendulum,
    moonbeam,
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

/**
 * POST v1/moonbeam
 */
router.use('/moonbeam', moonbeamRoutes);

/**
 * POST v1/pendulum
 */
router.use('/pendulum', pendulumRoutes);

/**
 * POST v1/storage
 */
router.use('/storage', storageRoutes);

/**
 * POST v1/email
 */
router.use('/email', emailRoutes);

/**
 * POST v1/subsidize
 */
router.use('/subsidize', subsidizeRoutes);

/**
 * POST v1/rating
 */
router.use('/rating', ratingRoutes);

module.exports = router;
