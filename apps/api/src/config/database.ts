import { readFileSync } from "node:fs";
import { Sequelize } from "sequelize";
import logger from "./logger";
import { config } from "./vars";

// Add database configuration to vars.ts
declare module "./vars" {
  interface Config {
    database: {
      host: string;
      port: number;
      username: string;
      password: string;
      database: string;
      dialect: "postgres";
      logging: boolean;
    };
  }
}

function getDialectOptions() {
  if (config.env !== "production") {
    return undefined;
  }

  const caCertPath = process.env.DB_SSL_CA_CERT_PATH;

  return {
    ssl: {
      ...(caCertPath ? { ca: readFileSync(caCertPath, "utf8") } : {}),
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
      require: true
    }
  };
}

// Create Sequelize instance
const sequelize = new Sequelize(config.database.database, config.database.username, config.database.password, {
  dialect: config.database.dialect,
  dialectOptions: getDialectOptions(),
  host: config.database.host,
  logging: config.database.logging ? msg => logger.debug(msg) : false,
  // Keep a couple of warm connections: with min 0 / idle 10s every quiet period dropped
  // all connections, so each request burst re-ran the full SCRAM handshake through the
  // Supabase pooler (Supavisor) — which times out with EAUTHTIMEOUT when the event loop
  // is busy, failing quotes and API-key validation.
  pool: {
    acquire: 30000,
    idle: 60000,
    max: 10,
    min: 2
  },
  port: config.database.port
});

// Test database connection
export const testDatabaseConnection = async (): Promise<void> => {
  try {
    await sequelize.authenticate();
    logger.info("Database connection has been established successfully.");
  } catch (error) {
    logger.error("Unable to connect to the database:", error);
    throw error;
  }
};

export default sequelize;
