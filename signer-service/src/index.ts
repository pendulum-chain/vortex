import dotenv from 'dotenv';

import { config } from './config/vars';
import logger from './config/logger';
import app from './config/express';
import {
  FUNDING_SECRET,
  PENDULUM_FUNDING_SEED,
  MOONBEAM_EXECUTOR_PRIVATE_KEY,
  CLIENT_DOMAIN_SECRET,
} from './constants/constants';
import { EventPoller } from './api/services/brla/webhooks';
import { DEFAULT_POLLING_INTERVAL } from './constants/constants';

const { port, env } = config;

dotenv.config();

// Consider grouping all environment checks into a single function
const validateRequiredEnvVars = () => {
  const requiredVars = {
    FUNDING_SECRET,
    PENDULUM_FUNDING_SEED,
    MOONBEAM_EXECUTOR_PRIVATE_KEY,
    CLIENT_DOMAIN_SECRET,
  };

  for (const [key, value] of Object.entries(requiredVars)) {
    if (!value) {
      logger.error(`${key} not set in the environment variables`);
      process.exit(1);
    }
  }
};

// Validate environment variables before starting the server
validateRequiredEnvVars();

export const eventPoller = new EventPoller(DEFAULT_POLLING_INTERVAL);

// listen to requests
app.listen(port, () => logger.info(`server started on port ${port} (${env})`));

/**
 * Exports express
 * @public
 */
export default app;
