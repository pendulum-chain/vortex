import { beforeAll, describe, expect, it } from "bun:test";
import { QueryTypes } from "sequelize";
import sequelize from "../config/database";
import { setupTestDatabase } from "../test-utils/db";
import { runMigrations } from "./migrator";

// Old-name/new-name pairs of the migrations renumbered to clear the duplicate-055 prefix.
// Must stay in sync with MIGRATION_RENAMES in migrator.ts.
const RENAMED = [
  ["055-create-api-credentials.ts", "057-create-api-credentials.ts"],
  ["057-create-partner-managed-profiles.ts", "058-create-partner-managed-profiles.ts"],
  ["058-add-api-credential-id-to-quote-tickets.ts", "059-add-api-credential-id-to-quote-tickets.ts"]
] as const;

async function metaNames(name: string): Promise<string[]> {
  const rows = await sequelize.query<{ name: string }>(`SELECT name FROM "SequelizeMeta" WHERE name = :name`, {
    replacements: { name },
    type: QueryTypes.SELECT
  });
  return rows.map(row => row.name);
}

describe("migration rename reconciliation", () => {
  beforeAll(async () => {
    await setupTestDatabase();
    // Self-heal: a previously aborted run of this suite may have left old-name rows behind.
    for (const [oldName] of RENAMED) {
      await sequelize.query(`DELETE FROM "SequelizeMeta" WHERE name = :oldName`, { replacements: { oldName } });
    }
  });

  it("records the renumbered migrations under their new names on a fresh database", async () => {
    for (const [oldName, newName] of RENAMED) {
      expect(await metaNames(newName)).toEqual([newName]);
      expect(await metaNames(oldName)).toEqual([]);
    }
  });

  it("renames old-name SequelizeMeta entries instead of re-running the migrations", async () => {
    // Simulate a database that executed the files under their pre-rename names (staging).
    for (const [oldName, newName] of RENAMED) {
      await sequelize.query(`DELETE FROM "SequelizeMeta" WHERE name = :newName`, { replacements: { newName } });
      await sequelize.query(`INSERT INTO "SequelizeMeta" (name) VALUES (:oldName)`, { replacements: { oldName } });
    }

    // Without reconciliation, umzug treats the renamed files as pending and 057/058 fail
    // on createTable against the already-present tables.
    await runMigrations();

    for (const [oldName, newName] of RENAMED) {
      expect(await metaNames(oldName)).toEqual([]);
      expect(await metaNames(newName)).toEqual([newName]);
    }
  });

  it("is idempotent across repeated startups", async () => {
    await runMigrations();
    await runMigrations();

    for (const [oldName, newName] of RENAMED) {
      expect(await metaNames(oldName)).toEqual([]);
      expect(await metaNames(newName)).toEqual([newName]);
    }
  });

  it("leaves a stale old-name row untouched when the new name is already recorded", async () => {
    const [oldName, newName] = RENAMED[0];
    await sequelize.query(`INSERT INTO "SequelizeMeta" (name) VALUES (:oldName)`, { replacements: { oldName } });

    // The NOT EXISTS guard must skip the rename instead of failing on the primary key,
    // and umzug must ignore the executed entry that matches no migration file.
    await runMigrations();

    expect(await metaNames(oldName)).toEqual([oldName]);
    expect(await metaNames(newName)).toEqual([newName]);

    await sequelize.query(`DELETE FROM "SequelizeMeta" WHERE name = :oldName`, { replacements: { oldName } });
  });
});
