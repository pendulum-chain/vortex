/**
 * One-off backfill: migrate legacy secret API keys onto the O(1) lookup format.
 *
 * Legacy rows store only the constant 8-char prefix (`sk_live_`) plus a bcrypt hash, so
 * every failed lookup has to bcrypt-compare the whole legacy pool — an unauthenticated
 * caller can trigger that with any random valid-format key (security spec `api-keys.md`,
 * invariant 7). The 16-char lookup prefix cannot be derived from a bcrypt hash, so the
 * only way to convert a row without changing the key is to present the original
 * plaintext once. That is what this script does.
 *
 * Run it with the plaintext keys you issued; each is matched to its row by bcrypt, then
 * rewritten to `keyPrefix` = first 16 chars and `keyHash` = SHA-256 digest. Keys are read
 * from a file (one per line) or stdin, never from argv — argv lands in shell history and
 * process listings. Nothing about a key is ever logged; only its 8-char public prefix and
 * a match/miss verdict.
 *
 * Usage:
 *   bun scripts/backfill-api-key-digests.ts --file /secure/path/keys.txt [--ssl-ca-cert /secure/path/database-ca.crt] [--dry-run]
 *   cat keys.txt | bun scripts/backfill-api-key-digests.ts [--ssl-ca-cert /secure/path/database-ca.crt] [--dry-run]
 *
 * Safe to re-run: already-migrated rows are skipped. Run it in every environment BEFORE
 * removing the legacy fallback from `validateSecretApiKey`, and confirm the remaining
 * legacy count is zero with the query printed at the end.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { Op } from "sequelize";

// This script is often invoked from outside apps/api, where Bun will not
// auto-load the API's .env file. Load it before importing database/config
// modules because vars.ts validates the environment during module evaluation.
dotenv.config({ path: path.resolve(import.meta.dir, "../.env") });

function readOption(name: string): string | undefined {
  const optionIndex = process.argv.indexOf(name);
  if (optionIndex === -1) return undefined;

  const value = process.argv[optionIndex + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function readKeys(): string[] {
  const keyFilePath = readOption("--file");
  const raw = keyFilePath ? readFileSync(keyFilePath, "utf8") : readFileSync(0, "utf8");

  return raw
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith("#"));
}

async function main(): Promise<void> {
  const sslCaCertPath = readOption("--ssl-ca-cert");
  if (sslCaCertPath) {
    // Set this before importing database.ts: Sequelize reads its TLS options
    // while that module is evaluated. A CLI value intentionally overrides .env.
    process.env.DB_SSL_CA_CERT_PATH = path.resolve(sslCaCertPath);
  }

  const [
    { digestApiKey, getKeyPrefix, getSecretKeyLookupPrefix, isValidSecretKeyFormat },
    { default: sequelize },
    { default: ApiKey }
  ] = await Promise.all([
    import("../src/api/middlewares/apiKeyAuth.helpers"),
    import("../src/config/database"),
    import("../src/models/apiKey.model")
  ]);

  try {
    const dryRun = process.argv.includes("--dry-run");
    const keys = readKeys();

    if (keys.length === 0) {
      throw new Error("No keys provided. Pass --file <path> or pipe keys on stdin (one per line).");
    }

    const malformed = keys.filter(key => !isValidSecretKeyFormat(key));
    if (malformed.length > 0) {
      throw new Error(`${malformed.length} input line(s) are not valid secret-key format; aborting without changes.`);
    }

    // Only rows still on the legacy format can be migrated: their prefix is the 8-char
    // constant. Already-migrated rows carry the 16-char prefix and are left alone.
    const legacyRows = await ApiKey.findAll({
      where: {
        keyType: "secret",
        [Op.and]: sequelize.where(sequelize.fn("length", sequelize.col("key_prefix")), 8)
      }
    });

    console.log(`Legacy secret-key rows found: ${legacyRows.length}`);
    console.log(`Plaintext keys supplied: ${keys.length}`);

    const matchedRowIds = new Set<string>();
    let migrated = 0;

    for (const key of keys) {
      const publicPrefix = getKeyPrefix(key);
      const candidates = legacyRows.filter(row => row.keyPrefix === publicPrefix && row.keyHash);

      let matched = false;
      for (const row of candidates) {
        if (matchedRowIds.has(row.id)) continue;
        // Legacy rows hold bcrypt hashes; this is the one place we still pay that cost.
        if (!(await bcrypt.compare(key, row.keyHash as string))) continue;

        matched = true;
        matchedRowIds.add(row.id);
        if (!dryRun) {
          await row.update({ keyHash: digestApiKey(key), keyPrefix: getSecretKeyLookupPrefix(key) });
        }
        migrated++;
        console.log(`  ${publicPrefix}… → migrated (row ${row.id}, active=${row.isActive})`);
        break;
      }

      if (!matched) {
        console.log(`  ${publicPrefix}… → NO MATCHING ROW (already migrated, revoked, or wrong environment)`);
      }
    }

    const unmatchedRows = legacyRows.filter(row => !matchedRowIds.has(row.id));

    console.log(`\n${dryRun ? "[dry run] would migrate" : "Migrated"}: ${migrated}`);
    console.log(`Legacy rows left unmigrated: ${unmatchedRows.length}`);
    for (const row of unmatchedRows) {
      console.log(`  row ${row.id} (active=${row.isActive}, name=${row.name ?? "-"}) — no plaintext supplied`);
    }

    if (unmatchedRows.some(row => row.isActive)) {
      console.log(
        "\n⚠️  Active legacy rows remain. The legacy bcrypt fallback must stay in place until\n" +
          "   they are migrated or revoked — removing it would break those keys."
      );
    } else {
      console.log("\n✅ No active legacy rows remain. The legacy fallback in validateSecretApiKey can be removed.");
    }

    console.log(
      "\nVerify independently with:\n  SELECT count(*) FROM api_keys WHERE key_type='secret' AND is_active AND length(key_prefix)=8;"
    );
  } finally {
    await sequelize.close();
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Backfill failed:", message);
  if (message.includes("ESSLREQUIRED") || message.includes("SSL connection is required")) {
    console.error(
      "The database requires TLS. Set DB_SSL_CA_CERT_PATH in apps/api/.env or pass " +
        "--ssl-ca-cert /path/to/database-ca.crt. If its CA is already trusted by your system, set DB_SSL_REQUIRED=true."
    );
  }
  process.exitCode = 1;
});
