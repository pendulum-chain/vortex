import dotenv from 'dotenv';

import { config } from './config/vars';
import logger from './config/logger';
import app from './config/express';
import {
  CLIENT_DOMAIN_SECRET,
  DEFAULT_POLLING_INTERVAL,
  FUNDING_SECRET,
  MOONBEAM_EXECUTOR_PRIVATE_KEY,
  PENDULUM_FUNDING_SEED,
} from './constants/constants';
import { ApiManager } from './api/services/pendulum/apiManager';
import { testDatabaseConnection } from './config/database';
import { runMigrations } from './database/migrator';
import './models'; // Initialize models
import cleanupWorker from './api/workers/cleanup.worker';
import rampRecoveryWorker from './api/workers/ramp-recovery.worker';
import registerPhaseHandlers from './api/services/phases/register-handlers';
import { EventPoller } from './api/services/brla/webhooks';

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

    const apiManager = ApiManager.getInstance();
    await apiManager.populateAllApis();

    // Start background workers
    cleanupWorker.start();
    rampRecoveryWorker.start();

    // Register phase handlers
    registerPhaseHandlers();

    // Start the server
    app.listen(port, () => logger.info(`server started on port ${port} (${env})`));
  } catch (error) {
    logger.error('Failed to initialize application:', error);
    process.exit(1);
  }
};

export const eventPoller = new EventPoller(DEFAULT_POLLING_INTERVAL);

// Start the application
initializeApp();

export default app;
