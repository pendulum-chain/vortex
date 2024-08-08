// make bluebird default Promise
Promise = require('bluebird'); // eslint-disable-line no-global-assign
const { Keypair } = require('stellar-sdk');
const { port, env } = require('./config/vars');
const logger = require('./config/logger');
const app = require('./config/express');

require('dotenv').config();

const FUNDING_SECRET = process.env.FUNDING_SECRET;
const PENDULUM_FUNDING_SEED = process.env.PENDULUM_FUNDING_SEED;

// stop the application if the funding secret key is not set
if (!FUNDING_SECRET) {
  logger.error('FUNDING_SECRET not set in the environment variables');
  process.exit(1);
}

// stop the application if the Pendulum funding seed is not set
if (!PENDULUM_FUNDING_SEED) {
  logger.error('PENDULUM_FUNDING_SECRET not set in the environment variables');
  process.exit(1);
}

// listen to requests
app.listen(port, () => logger.info(`server started on port ${port} (${env})`));

/**
 * Exports express
 * @public
 */
module.exports = app;
