import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";

describe("migration ordering", () => {
  it("uses each numeric prefix only once after 054", () => {
    const migrations = readdirSync(new URL("./migrations", import.meta.url))
      .filter(name => /^\d+-.*\.ts$/.test(name))
      .sort();
    // Older migrations contain known duplicate prefixes. The sequence has been unique
    // since 055 was reconciled, so new migrations must preserve that contract.
    const prefixes = migrations.map(name => name.split("-", 1)[0]).filter(prefix => Number(prefix) >= 55);

    expect(prefixes).toEqual([...new Set(prefixes)]);
  });
});
