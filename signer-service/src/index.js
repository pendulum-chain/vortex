// make bluebird default Promise
Promise = require("bluebird"); // eslint-disable-line no-global-assign
const { port, env } = require("./config/vars");
const logger = require("./config/logger");
const app = require("./config/express");
const memcached = require("./config/memcached");

// open memcached connection
memcached.connect().catch((err) => {
  logger.error("Error connecting to memcached instance", err);
});

require('dotenv').config();

const FUNDING_PUBLIC_KEY = process.env.FUNDING_PUBLIC_KEY;
const FUNDING_SECRET = process.env.FUNDING_SECRET;

// stop the application if the funding keys are not set
if (!FUNDING_PUBLIC_KEY || !FUNDING_SECRET) {
  logger.error("FUNDING_PUBLIC_KEY or FUNDING_SECRET not set in the environment variables");
  process.exit(1);
}

// listen to requests
app.listen(port, () => logger.info(`server started on port ${port} (${env})`));

/**
 * Exports express
 * @public
 */
module.exports = app;
