/**
 * Local-development cleanup for ramps left in the initial phase by older
 * application versions.
 *
 * Preview:
 *   bun run timeout:initial-ramps
 *
 * Apply:
 *   bun run timeout:initial-ramps --execute
 *
 * The write is intentionally restricted to development/test runtimes using a
 * loopback database host. It updates only current_phase (plus updated_at via
 * Sequelize) and leaves quote, history, and financial-operation data intact.
 */
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(import.meta.dir, "../.env") });

const execute = process.argv.includes("--execute");
const unknownArguments = process.argv.slice(2).filter(argument => argument !== "--execute");
if (unknownArguments.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);
}

const nodeEnv = process.env.NODE_ENV ?? "production";
const databaseHost = process.env.DB_HOST ?? "localhost";
const localDatabaseHosts = new Set(["127.0.0.1", "::1", "localhost"]);

if (!["development", "test"].includes(nodeEnv) || !localDatabaseHosts.has(databaseHost)) {
  throw new Error(
    `Refusing to modify a non-local database (NODE_ENV=${nodeEnv}, DB_HOST=${databaseHost}). ` +
      "This cleanup is restricted to development/test with a loopback database host."
  );
}

async function main(): Promise<void> {
  const [{ default: sequelize }, { default: RampState }] = await Promise.all([
    import("../src/config/database"),
    import("../src/models/rampState.model")
  ]);

  try {
    const candidates = await RampState.findAll({
      attributes: ["createdAt", "id", "quoteId"],
      order: [["createdAt", "ASC"]],
      where: { currentPhase: "initial" }
    });

    console.log(`Ramps currently in initial: ${candidates.length}`);
    if (candidates.length === 0) return;

    console.log(`Oldest: ${candidates[0].createdAt.toISOString()} (${candidates[0].id})`);
    console.log(`Newest: ${candidates.at(-1)?.createdAt.toISOString()} (${candidates.at(-1)?.id})`);

    if (!execute) {
      console.log("\nPreview only; no rows changed. Re-run with --execute to set all of them to timedOut.");
      return;
    }

    const [updated] = await RampState.update(
      { currentPhase: "timedOut" },
      {
        where: { currentPhase: "initial" }
      }
    );

    console.log(`\nUpdated ${updated} ramp(s) from initial to timedOut.`);
  } finally {
    await sequelize.close();
  }
}

main().catch(error => {
  console.error("Failed to time out initial ramps:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
