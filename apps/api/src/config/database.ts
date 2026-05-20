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
  pool: {
    acquire: 30000,
    idle: 10000,
    max: 10,
    min: 0
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
