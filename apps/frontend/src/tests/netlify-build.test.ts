import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");

describe("Netlify build settings", () => {
  // The ignore check reads a missing build cache as "no change", so a deployed branch using it can stop deploying for good.
  it.each(["production", "staging"])("never skips a build of %s", context => {
    expect(config).toContain(`[context.${context}]\n  ignore = "/bin/false"\n`);
  });

  it("builds with the Bun version the repo pins", () => {
    const pinned = readFileSync(new URL("../../../../.bun-version", import.meta.url), "utf8").trim();
    expect(config).toContain(`BUN_VERSION = "${pinned}"`);
  });
});
