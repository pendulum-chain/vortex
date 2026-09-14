import { beforeAll, describe, expect, it } from "bun:test";
import { QueryTypes } from "sequelize";
import sequelize from "../config/database";
import { setupTestDatabase } from "../test-utils/db";
import { getExecutedMigrations, getPendingMigrations, revertLastMigration, revertMigration, runMigrations } from "./migrator";

// Old-name/new-name pairs of the migrations renumbered to clear the duplicate-055 prefix.
// Must stay in sync with MIGRATION_RENAMES in migrator.ts.
const RENAMED = [
  ["051-monerium-b2b-onramp-tables.js", "069-monerium-b2b-onramp-tables.js"],
  ["052-monerium-keeper-chain-state.js", "070-monerium-keeper-chain-state.js"],
  ["055-create-api-credentials.js", "057-create-api-credentials.js"],
  ["057-create-partner-managed-profiles.js", "058-create-partner-managed-profiles.js"],
  ["058-add-api-credential-id-to-quote-tickets.js", "059-add-api-credential-id-to-quote-tickets.js"]
] as const;

async function metaNames(name: string): Promise<string[]> {
  const rows = await sequelize.query<{ name: string }>(`SELECT name FROM "SequelizeMeta" WHERE name = :name`, {
    replacements: { name },
    type: QueryTypes.SELECT
  });
  return rows.map(row => row.name);
}

describe("migration metadata reconciliation", () => {
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

  it("recognizes compiled migration records while loading TypeScript source files", async () => {
    const jsName = "009-update-ramp-direction-enums.js";
    const tsName = "009-update-ramp-direction-enums.ts";
    await sequelize.query(`DELETE FROM "SequelizeMeta" WHERE name IN (:jsName, :tsName)`, {
      replacements: { jsName, tsName }
    });
    await sequelize.query(`INSERT INTO "SequelizeMeta" (name) VALUES (:jsName)`, { replacements: { jsName } });

    const pending = await getPendingMigrations();

    expect(pending).not.toContain(jsName);
    expect(pending).not.toContain(tsName);
  });

  it("normalizes migration records created by older TypeScript development runs", async () => {
    const jsName = "009-update-ramp-direction-enums.js";
    const tsName = "009-update-ramp-direction-enums.ts";
    await sequelize.query(`DELETE FROM "SequelizeMeta" WHERE name IN (:jsName, :tsName)`, {
      replacements: { jsName, tsName }
    });
    await sequelize.query(`INSERT INTO "SequelizeMeta" (name) VALUES (:tsName)`, { replacements: { tsName } });

    await runMigrations();

    expect(await metaNames(tsName)).toEqual([]);
    expect(await metaNames(jsName)).toEqual([jsName]);
  });

  it("normalizes TypeScript old-name rows before applying migration renames", async () => {
    const [oldJsName, newJsName] = RENAMED[0];
    const oldTsName = oldJsName.replace(/\.js$/, ".ts");
    await sequelize.query(`DELETE FROM "SequelizeMeta" WHERE name IN (:oldJsName, :oldTsName, :newJsName)`, {
      replacements: { newJsName, oldJsName, oldTsName }
    });
    await sequelize.query(`INSERT INTO "SequelizeMeta" (name) VALUES (:oldTsName)`, { replacements: { oldTsName } });

    try {
      await runMigrations();

      expect(await metaNames(oldTsName)).toEqual([]);
      expect(await metaNames(oldJsName)).toEqual([]);
      expect(await metaNames(newJsName)).toEqual([newJsName]);
    } finally {
      await runMigrations();
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

  it("reconciles legacy TypeScript metadata before reverting the last migration", async () => {
    const jsName = (await getExecutedMigrations()).at(-1);
    if (!jsName) throw new Error("Expected at least one executed migration");
    const tsName = jsName.replace(/\.js$/, ".ts");
    await sequelize.query(`UPDATE "SequelizeMeta" SET name = :tsName WHERE name = :jsName`, {
      replacements: { jsName, tsName }
    });

    try {
      await revertLastMigration();

      expect(await metaNames(tsName)).toEqual([]);
      expect(await metaNames(jsName)).toEqual([]);
    } finally {
      await runMigrations();
    }
  });

  it("accepts a TypeScript migration name when reverting a specific migration", async () => {
    const jsName = "066-add-kyc-verification-state.js";
    const tsName = "066-add-kyc-verification-state.ts";
    await sequelize.query(`UPDATE "SequelizeMeta" SET name = :tsName WHERE name = :jsName`, {
      replacements: { jsName, tsName }
    });

    try {
      await revertMigration(tsName);

      expect(await metaNames(tsName)).toEqual([]);
      expect(await metaNames(jsName)).toEqual([]);
    } finally {
      await runMigrations();
    }
  });
});
