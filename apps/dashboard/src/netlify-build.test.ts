import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const config = readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");

describe("Netlify build settings", () => {
  // The default ignore check reads a missing build cache as "no change", so a deployed branch using it can stop deploying.
  for (const context of ["production", "staging"]) {
    it(`never skips a build of ${context}`, () => {
      assert.ok(config.includes(`[context.${context}]\n  ignore = "/bin/false"\n`));
    });
  }

  it("builds with the Bun version the repo pins", () => {
    const pinned = readFileSync(new URL("../../../.bun-version", import.meta.url), "utf8").trim();
    assert.ok(config.includes(`BUN_VERSION = "${pinned}"`));
  });
});
