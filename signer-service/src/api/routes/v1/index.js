const express = require('express');
const stellarRoutes = require('./stellar.route');
const pendulumRoutes = require('./pendulum.route');
const storageRoutes = require('./storage.route');

const router = express.Router({ mergeParams: true });
const { sendStatusWithPk: sendStellarStatusWithPk } = require('../../controllers/stellar.controller');
const { sendStatusWithPk: sendPendulumStatusWithPk} = require('../../controllers/pendulum.controller');

function sendStatusWithPk(req, res, next) {
  const stellar = sendStellarStatusWithPk();
  const pendulum = sendPendulumStatusWithPk();

  console.log(stellar);
  console.log(pendulum);

  res.json({
    stellar,
    pendulum
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

module.exports = router;
