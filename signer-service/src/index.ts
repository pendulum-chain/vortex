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
import { ApiManager } from './api/services/pendulum/createPolkadotApi';
import { testDatabaseConnection } from './config/database';
import { runMigrations } from './database/migrator';
import './models'; // Initialize models
import cleanupWorker from './api/workers/cleanup.worker';

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

// Initialize the application
const initializeApp = async () => {
  try {
    // Validate environment variables before starting the server
    validateRequiredEnvVars();

    // Test database connection
    await testDatabaseConnection();

    // Run database migrations
    await runMigrations();

    // Initialize event poller and API manager
    const eventPoller = new EventPoller(DEFAULT_POLLING_INTERVAL);
    const apiManager = new ApiManager();
    await apiManager.populateApi();
    
    // Start background workers
    cleanupWorker.start();

    // Start the server
    app.listen(port, () => logger.info(`server started on port ${port} (${env})`));
  } catch (error) {
    logger.error('Failed to initialize application:', error);
    process.exit(1);
  }
};

// Start the application
initializeApp();

// Export event poller and API manager for testing
export const eventPoller = new EventPoller(DEFAULT_POLLING_INTERVAL);
export const apiManager = new ApiManager();

/**
 * Exports express
 * @public
 */
export default app;
