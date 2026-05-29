import { setLogger } from "@vortexfi/shared";
import dotenv from "dotenv";
import { Server } from "http";
import path from "path";
import cryptoService from "./config/crypto";
import { testDatabaseConnection } from "./config/database";
import app, { markReady, markStartupFailed, mountRoutes } from "./config/express";
import logger from "./config/logger";
import { config } from "./config/vars";

import { runMigrations } from "./database/migrator";
import "./models"; // Initialize models

dotenv.config({
  path: [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../.env")]
});

const { port, env } = config;

setLogger(logger);

function formatStartupError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}${error.stack ? `\n${error.stack}` : ""}`;
  }

  return String(error);
}

function startHttpServer(): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      server.off("error", reject);
      logger.info(`server started on port ${port} (${env}); bootstrapping dependencies`);
      resolve(server);
    });

    server.once("error", reject);
  });
}

// Consider grouping all environment checks into a single function
const validateRequiredEnvVars = () => {
  const requiredVars = {
    CLIENT_DOMAIN_SECRET: config.secrets.clientDomainSecret,
    FUNDING_SECRET: config.secrets.stellarFundingSecret,
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
  let server: Server | undefined;

  try {
    // Validate environment variables before starting the server
    validateRequiredEnvVars();

    // Initialize RSA keys for webhook signing
    cryptoService.initializeKeys();

    // Bind the HTTP port before long-running network/database warmup so Render can detect the service.
    server = await startHttpServer();

    const [
      { ApiManager, EvmClientManager, initializeEvmTokens },
      { AlfredpayLimitsService },
      { default: registerPhaseHandlers }
    ] = await Promise.all([
      import("@vortexfi/shared"),
      import("./api/services/alfredpay/alfredpay-limits.service"),
      import("./api/services/phases/register-handlers")
    ]);

    // Initialize dynamic EVM tokens from SquidRouter API (falls back to static config on failure)
    await initializeEvmTokens();

    // Test database connection
    await testDatabaseConnection();

    // Run database migrations
    await runMigrations();

    const apiManager = ApiManager.getInstance();
    await apiManager.populateAllApis();

    // Initialize EVM clients
    const _evmClientManager = EvmClientManager.getInstance();

    const [{ default: CleanupWorker }, { default: RampRecoveryWorker }, { default: UnhandledPaymentWorker }] =
      await Promise.all([
        import("./api/workers/cleanup.worker"),
        import("./api/workers/ramp-recovery.worker"),
        import("./api/workers/unhandled-payment.worker")
      ]);

    // Start background workers
    new CleanupWorker().start();
    new RampRecoveryWorker().start();
    new UnhandledPaymentWorker().start();

    // Start AlfredPay limits refresh loop (daily; falls back to hardcoded if stale)
    AlfredpayLimitsService.getInstance().start();

    // Register phase handlers
    registerPhaseHandlers();

    // Mount API routes only after startup tasks are complete.
    await mountRoutes();
    markReady();
    logger.info(`application ready on port ${port} (${env})`);
  } catch (error) {
    markStartupFailed();
    logger.error(`Failed to initialize application: ${formatStartupError(error)}`);

    if (!server) {
      process.exit(1);
    }

    server.close(() => process.exit(1));
    setTimeout(() => process.exit(1), 5000).unref();
  }
};

// Start the application
initializeApp();
