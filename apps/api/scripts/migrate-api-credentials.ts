import sequelize from "../src/config/database";
import { loadApiCredentialMigrationManifest, migrateApiCredentials } from "./api-credential-migration";

function manifestPath(): string {
  const flag = process.argv.indexOf("--manifest");
  const path = flag >= 0 ? process.argv[flag + 1] : undefined;
  if (!path) throw new Error("Usage: bun credentials:migrate --manifest <manifest.json>");
  return path;
}

try {
  await sequelize.authenticate();
  const count = await migrateApiCredentials(await loadApiCredentialMigrationManifest(manifestPath()));
  console.log(`Migrated ${count} credential pair(s); corresponding legacy rows were revoked.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Credential migration failed");
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
