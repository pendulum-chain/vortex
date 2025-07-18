import dotenv from "dotenv";
import path from "path";

dotenv.config({
  path: [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../.env")]
});

import { EvmClientManager } from "./api/services/evm/clientManager";
import { ApiManager } from "./api/services/pendulum/apiManager";
import { testDatabaseConnection } from "./config/database";
import app from "./config/express";
import logger from "./config/logger";
import { config } from "./config/vars";
import {
  CLIENT_DOMAIN_SECRET,
  DEFAULT_POLLING_INTERVAL,
  FUNDING_SECRET,
  MOONBEAM_EXECUTOR_PRIVATE_KEY,
  PENDULUM_FUNDING_SEED
} from "./constants/constants";
import { runMigrations } from "./database/migrator";
import "./models"; // Initialize models
import { EventPoller } from "./api/services/brla/webhooks";
import registerPhaseHandlers from "./api/services/phases/register-handlers";
import CleanupWorker from "./api/workers/cleanup.worker";
import RampRecoveryWorker from "./api/workers/ramp-recovery.worker";
import UnhandledPaymentWorker from "./api/workers/unhandled-payment.worker";

const { port, env } = config;

// Consider grouping all environment checks into a single function
const validateRequiredEnvVars = () => {
  const requiredVars = {
    CLIENT_DOMAIN_SECRET,
    FUNDING_SECRET,
    MOONBEAM_EXECUTOR_PRIVATE_KEY,
    PENDULUM_FUNDING_SEED
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

    // Initialize EVM clients
    const _evmClientManager = EvmClientManager.getInstance();

    // Start background workers
    new CleanupWorker().start();
    new RampRecoveryWorker().start();
    new UnhandledPaymentWorker().start();

    // Register phase handlers
    registerPhaseHandlers();

    // Start the server
    app.listen(port, () => logger.info(`server started on port ${port} (${env})`));
  } catch (error) {
    logger.error("Failed to initialize application:", error);
    process.exit(1);
  }
};

export const eventPoller = new EventPoller(DEFAULT_POLLING_INTERVAL);

// Start the application
initializeApp();
