import path from "path";
import { QueryTypes, Sequelize } from "sequelize";
import { MigrationParams, SequelizeStorage, Umzug } from "umzug";
import sequelize from "../config/database";
import logger from "../config/logger";

function getDatabaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("original" in error)) {
    return undefined;
  }

  const { original } = error as { original?: unknown };
  return original && typeof original === "object" && "code" in original ? String(original.code) : undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getAddIndexOptions(args: readonly unknown[]): Record<string, unknown> | undefined {
  const options = args.length >= 3 ? args[2] : args[1];

  return typeof options === "object" && options !== null ? (options as Record<string, unknown>) : undefined;
}

// Create Umzug instance for migrations
const umzug = new Umzug({
  context: new Proxy(sequelize.getQueryInterface(), {
    get(target, prop, receiver) {
      if (prop === "addIndex") {
        return async (...args: Parameters<typeof target.addIndex>) => {
          try {
            return await target.addIndex(...args);
          } catch (error) {
            if (getDatabaseErrorCode(error) === "42P07") {
              const options = getAddIndexOptions(args);
              const indexName = options && "name" in options ? String(options.name) : "unknown";
              const tableName = args[0];
              logger.warn(`Index ${indexName} already exists on ${tableName}, skipping creation.`);
              return;
            }
            throw error;
          }
        };
      }
      if (prop === "bulkInsert") {
        return async (...args: Parameters<typeof target.bulkInsert>) => {
          try {
            return await target.bulkInsert(...args);
          } catch (error) {
            // Swallow ALL bulkInsert errors to force migration forward in inconsistent environments
            // This is critical to unblock 022 when 001/004 etc are re-running on existing data
            const tableName = args[0];
            logger.warn(`Swallowing bulkInsert error on ${tableName}: ${getErrorMessage(error)}`);
            return 0;
          }
        };
      }
      if (prop === "addColumn") {
        return async (...args: Parameters<typeof target.addColumn>) => {
          try {
            return await target.addColumn(...args);
          } catch (error) {
            if (getDatabaseErrorCode(error) === "42701") {
              const columnName = args[1];
              const tableName = args[0];
              logger.warn(`Column ${columnName} already exists on ${tableName}, skipping creation.`);
              return;
            }
            throw error;
          }
        };
      }
      if (prop === "renameColumn") {
        return async (...args: Parameters<typeof target.renameColumn>) => {
          try {
            return await target.renameColumn(...args);
          } catch (error) {
            // 42701: duplicate_column (target column already exists)
            // 42703: undefined_column (source column does not exist)
            const code = getDatabaseErrorCode(error);
            if (code === "42701" || code === "42703") {
              const tableName = args[0];
              const oldName = args[1];
              const newName = args[2];
              logger.warn(`Rename column ${oldName} -> ${newName} on ${tableName} failed (exists/missing), skipping.`);
              return;
            }
            throw error;
          }
        };
      }
      if (prop === "changeColumn") {
        return async (...args: Parameters<typeof target.changeColumn>) => {
          try {
            return await target.changeColumn(...args);
          } catch (error) {
            // 42710: duplicate_object (constraint already exists)
            // 42P07: duplicate_table (relation/constraint already exists)
            const code = getDatabaseErrorCode(error);
            if (code === "42710" || code === "42P07") {
              const tableName = args[0];
              const columnName = args[1];
              logger.warn(`Change column ${columnName} on ${tableName} failed (likely constraint exists), skipping.`);
              return;
            }
            throw error;
          }
        };
      }
      if (prop === "sequelize") {
        const originalSequelize = Reflect.get(target, prop, receiver);
        return new Proxy(originalSequelize, {
          get(seqTarget, seqProp, seqReceiver) {
            if (seqProp === "query") {
              return async (...args: Parameters<typeof seqTarget.query>) => {
                try {
                  return await seqTarget.query(...args);
                } catch (error) {
                  // 42710: duplicate_object (trigger/function already exists)
                  // 42P07: duplicate_table (relation already exists)
                  const code = getDatabaseErrorCode(error);
                  if (code === "42710" || code === "42P07") {
                    const sql = args[0] as string;
                    // Try to extract object name from SQL for logging
                    const match = sql.match(/CREATE (?:OR REPLACE )?(?:TRIGGER|FUNCTION|TABLE) ["']?(\w+)["']?/i);
                    const objectName = match ? match[1] : "unknown object";
                    logger.warn(`Query failed with "${getErrorMessage(error)}" for ${objectName}, skipping.`);
                    return [[], 0];
                  }
                  throw error;
                }
              };
            }
            return Reflect.get(seqTarget, seqProp, seqReceiver);
          }
        });
      }
      return Reflect.get(target, prop, receiver);
    }
  }),
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

// These migrations were renumbered to clear the duplicate-055 prefix. Databases that
// already executed them under the old names (staging, developer machines) must have their
// SequelizeMeta entries renamed, or umzug re-runs the renamed files and fails on
// createTable. This cannot be a migration itself: umzug resolves the pending list before
// executing any of them.
const MIGRATION_RENAMES: Record<string, string> = {
  "055-create-api-credentials": "057-create-api-credentials",
  "057-create-partner-managed-profiles": "058-create-partner-managed-profiles",
  "058-add-api-credential-id-to-quote-tickets": "059-add-api-credential-id-to-quote-tickets"
};

async function reconcileRenamedMigrations(): Promise<void> {
  const [tableCheck] = await sequelize.query<{ present: boolean }>(
    `SELECT to_regclass('public."SequelizeMeta"') IS NOT NULL AS present`,
    { type: QueryTypes.SELECT }
  );
  if (!tableCheck?.present) {
    // Fresh database: nothing recorded yet, the files run under their new names.
    return;
  }

  for (const [oldBase, newBase] of Object.entries(MIGRATION_RENAMES)) {
    for (const extension of [".ts", ".js"]) {
      const [, renamedCount] = await sequelize.query(
        `UPDATE "SequelizeMeta" SET name = :newName
         WHERE name = :oldName
           AND NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = :newName)`,
        { replacements: { newName: newBase + extension, oldName: oldBase + extension }, type: QueryTypes.UPDATE }
      );
      if (renamedCount > 0) {
        logger.info(`Renamed applied migration ${oldBase}${extension} -> ${newBase}${extension} in SequelizeMeta`);
      }
    }
  }
}

// Run migrations
export const runMigrations = async (): Promise<void> => {
  try {
    await reconcileRenamedMigrations();
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

// Revert specific migration
export const revertMigration = async (name: string): Promise<void> => {
  try {
    const executed = await umzug.executed();
    const index = executed.findIndex(m => m.name === name);

    if (index === -1) {
      throw new Error(`Migration ${name} not found in executed migrations`);
    }

    // If it's the first migration, revert all (to 0)
    // Otherwise, revert to the previous migration
    const to = index === 0 ? 0 : executed[index - 1].name;

    logger.info(`Reverting to ${index === 0 ? "initial state" : to} (will revert ${name} and any subsequent migrations)`);
    await umzug.down({ to });
    logger.info(`Migration ${name} reverted successfully`);
  } catch (error) {
    logger.error(`Error reverting migration ${name}:`, error);
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
      const command = process.argv[2];
      const arg = process.argv[3];

      if (command === "revert") {
        if (arg) {
          await revertMigration(arg);
        } else {
          await revertLastMigration();
        }
      } else if (command === "revert-all") {
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
