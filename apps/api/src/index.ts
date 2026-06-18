import { EvmClientManager, initializeEvmTokens, setLogger } from "@vortexfi/shared";
import dotenv from "dotenv";
import path from "path";
import cryptoService from "./config/crypto";
import { testDatabaseConnection } from "./config/database";
import app from "./config/express";
import logger from "./config/logger";
import { config } from "./config/vars";

import { runMigrations } from "./database/migrator";
import "./models"; // Initialize models
import { AlfredpayLimitsService } from "./api/services/alfredpay/alfredpay-limits.service";
import registerPhaseHandlers from "./api/services/phases/register-handlers";
import ApiClientEventsRetentionWorker from "./api/workers/api-client-events-retention.worker";
import CleanupWorker from "./api/workers/cleanup.worker";
import RampRecoveryWorker from "./api/workers/ramp-recovery.worker";
import UnhandledPaymentWorker from "./api/workers/unhandled-payment.worker";

dotenv.config({
  path: [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../.env")]
});

const { port, env } = config;

setLogger(logger);

// Consider grouping all environment checks into a single function
const validateRequiredEnvVars = () => {
  const requiredVars = {
    CLIENT_DOMAIN_SECRET: config.secrets.clientDomainSecret,
    MOONBEAM_EXECUTOR_PRIVATE_KEY: config.secrets.moonbeamExecutorPrivateKey,
    PENDULUM_FUNDING_SEED: config.secrets.pendulumFundingSeed
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

    // Initialize RSA keys for webhook signing
    cryptoService.initializeKeys();

    // Initialize dynamic EVM tokens from SquidRouter API (falls back to static config on failure)
    await initializeEvmTokens();

    // Test database connection
    await testDatabaseConnection();

    // Run database migrations
    await runMigrations();

    // Initialize EVM clients
    const _evmClientManager = EvmClientManager.getInstance();

    // Start background workers
    new CleanupWorker().start();
    new ApiClientEventsRetentionWorker().start();
    new RampRecoveryWorker().start();
    new UnhandledPaymentWorker().start();

    // Start AlfredPay limits refresh loop (daily; falls back to hardcoded if stale)
    AlfredpayLimitsService.getInstance().start();

    // Register phase handlers
    registerPhaseHandlers();

    // Start the server
    app.listen(port, () => logger.info(`server started on port ${port} (${env})`));
  } catch (error) {
    logger.error("Failed to initialize application:", error);
    process.exit(1);
  }
};

// Start the application
initializeApp();
