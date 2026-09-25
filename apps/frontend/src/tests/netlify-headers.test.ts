import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Reads the [[headers]] blocks of netlify.toml: a `for = "<path>"` line followed by `Name = "value"` lines.
const headerRules = readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8")
  .split("[[headers]]")
  .slice(1)
  .map(block => ({
    path: block.match(/^\s*for\s*=\s*"([^"]+)"/m)?.[1],
    values: Object.fromEntries(
      [...block.matchAll(/^\s*([A-Za-z-]+)\s*=\s*"([^"]*)"\s*$/gm)]
        .filter(([, name]) => name !== "for")
        .map(([, name, value]) => [name, value])
    )
  }));

describe("Netlify headers", () => {
  it("keeps the gold app out of third-party frames", () => {
    expect(headerRules.find(rule => rule.path === "/pt-br/gold/*")?.values).toMatchObject({
      "Content-Security-Policy": "frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY"
    });
  });

  it("does not apply the anti-framing headers beyond gold", () => {
    expect(headerRules.filter(rule => rule.values["X-Frame-Options"]).map(rule => rule.path)).toEqual(["/pt-br/gold/*"]);
  });
});
