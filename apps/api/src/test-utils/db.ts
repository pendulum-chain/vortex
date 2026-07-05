import sequelize from "../config/database";
import { runMigrations } from "../database/migrator";
// Importing the models index registers every model and association on the sequelize instance.
import "../models";

let initialized = false;

/**
 * Connects to the dedicated test database and brings it to the latest migration.
 * Idempotent; call from beforeAll in any integration test.
 */
export async function setupTestDatabase(): Promise<void> {
  if (initialized) {
    return;
  }

  const dbName = sequelize.getDatabaseName();
  if (!dbName.includes("test")) {
    throw new Error(
      `Refusing to run integration tests against database '${dbName}'. ` +
        "The test preload should have pointed DB_NAME at 'vortex_test' — check src/test-utils/preload.ts."
    );
  }

  try {
    await sequelize.authenticate();
  } catch (error) {
    throw new Error(
      `Could not connect to the test database at ${sequelize.config.host}:${sequelize.config.port}. ` +
        "Start it with `bun test:db:start` (from apps/api). " +
        `Original error: ${error instanceof Error ? error.message : error}`
    );
  }

  await runMigrations();
  initialized = true;
}

/**
 * Empties all application tables between tests while keeping the schema and
 * migration bookkeeping intact.
 */
export async function truncateAllTables(): Promise<void> {
  const tables = Object.values(sequelize.models)
    // Umzug's SequelizeStorage registers SequelizeMeta as a model; wiping it
    // would make every migration re-run on the next setup.
    .filter(model => model.name !== "SequelizeMeta")
    .map(model => `"${model.getTableName()}"`)
    .join(", ");
  await sequelize.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}
