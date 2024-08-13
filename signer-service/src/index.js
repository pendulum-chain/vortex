const { Keypair } = require('stellar-sdk');
const { port, env } = require('./config/vars');
const logger = require('./config/logger');
const app = require('./config/express');

require('dotenv').config();

const FUNDING_SECRET = process.env.FUNDING_SECRET;

// stop the application if the funding secret key is not set
if (!FUNDING_SECRET) {
  logger.error('FUNDING_SECRET not set in the environment variables');
  process.exit(1);
}

// listen to requests
app.listen(port, () => logger.info(`server started on port ${port} (${env})`));

/**
 * Exports express
 * @public
 */
module.exports = app;
