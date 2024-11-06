const { Keypair } = require('stellar-sdk');
const { port, env } = require('./config/vars');
const logger = require('./config/logger');
const app = require('./config/express');
require('dotenv').config();

const {
  FUNDING_SECRET,
  PENDULUM_FUNDING_SEED,
  MOONBEAM_EXECUTOR_PRIVATE_KEY,
  CLIENT_SECRET,
} = require('./constants/constants');

//stop the application if the funding secret key is not set
if (!FUNDING_SECRET) {
  logger.error('FUNDING_SECRET not set in the environment variables');
  process.exit(1);
}

// stop the application if the Pendulum funding seed is not set
if (!PENDULUM_FUNDING_SEED) {
  logger.error('PENDULUM_FUNDING_SEED not set in the environment variables');
  process.exit(1);
}

// stop the application if the Moonbeam executor private key is not set
if (!MOONBEAM_EXECUTOR_PRIVATE_KEY) {
  logger.error('MOONBEAM_EXECUTOR_PRIVATE_KEY not set in the environment variables');
  process.exit(1);
}

if (!CLIENT_SECRET) {
  logger.error('CLIENT_SECRET not set in the environment variables');
  process.exit(1);
}

// listen to requests
app.listen(port, () => logger.info(`server started on port ${port} (${env})`));

/**
 * Exports express
 * @public
 */
module.exports = app;
