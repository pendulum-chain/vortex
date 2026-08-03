import sequelize from "../src/config/database";
import { loadApiCredentialMigrationManifest, preflightApiCredentialMigration } from "./api-credential-migration";

function manifestPath(): string {
  const flag = process.argv.indexOf("--manifest");
  const path = flag >= 0 ? process.argv[flag + 1] : undefined;
  if (!path) throw new Error("Usage: bun credentials:preflight --manifest <manifest.json>");
  return path;
}

try {
  await sequelize.authenticate();
  const count = await preflightApiCredentialMigration(await loadApiCredentialMigrationManifest(manifestPath()));
  console.log(`Credential migration preflight passed for ${count} credential pair(s). No database rows were changed.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Credential migration preflight failed");
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
