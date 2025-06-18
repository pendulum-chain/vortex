import path from "path";
import { Sequelize } from "sequelize";
import { MigrationParams, SequelizeStorage, Umzug } from "umzug";
import sequelize from "../config/database";
import logger from "../config/logger";

// Create Umzug instance for migrations
const umzug = new Umzug({
  context: sequelize.getQueryInterface(),
  logger: {
    debug: (message: unknown) => logger.debug(message),
    error: (message: unknown) => logger.error(message),
    info: (message: unknown) => logger.info(message),
    warn: (message: unknown) => logger.warn(message)
  },
  migrations: {
    glob: path.join(__dirname, "./migrations/*.{ts,js}"),
    resolve: ({ name, path, context }: MigrationParams<unknown>) => {
      if (!path) {
        throw new Error(`Migration path is undefined for ${name}`);
      }
      // biome-ignore lint/style/noCommonJs: Dynamic require is necessary here for loading migration files at runtime based on file paths resolved by Umzug's glob pattern
      const migration = require(path);
      return {
        down: async () => migration.down(context, Sequelize),
        name,
        up: async () => migration.up(context, Sequelize)
      };
    }
  },
  storage: new SequelizeStorage({ sequelize })
});

// Run migrations
export const runMigrations = async (): Promise<void> => {
  try {
    await umzug.up();
    logger.info("Migrations completed successfully");
  } catch (error) {
    logger.error("Error running migrations:", error);
    throw error;
  }
};

// Revert last migration
export const revertLastMigration = async (): Promise<void> => {
  try {
    await umzug.down();
    logger.info("Last migration reverted successfully");
  } catch (error) {
    logger.error("Error reverting migration:", error);
    throw error;
  }
};

// Revert all migrations
export const revertAllMigrations = async (): Promise<void> => {
  try {
    await umzug.down({ to: 0 });
    logger.info("All migrations reverted successfully");
  } catch (error) {
    logger.error("Error reverting migrations:", error);
    throw error;
  }
};

// Get pending migrations
export const getPendingMigrations = async (): Promise<string[]> => {
  const pending = await umzug.pending();
  return pending.map((migration: { name: string }) => migration.name);
};

// Get executed migrations
export const getExecutedMigrations = async (): Promise<string[]> => {
  const executed = await umzug.executed();
  return executed.map((migration: { name: string }) => migration.name);
};

// Run migrations if this file is executed directly
if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      logger.info("Connection to the database has been established successfully");

      // Check if the script is execute to run or revert migrations
      if (process.argv[2] === "revert") {
        await revertLastMigration();
      } else if (process.argv[2] === "revert-all") {
        await revertAllMigrations();
      } else {
        await runMigrations();
      }

      process.exit(0);
    } catch (error) {
      console.error("Error performing action:", error);
      process.exit(1);
    }
  })();
}
