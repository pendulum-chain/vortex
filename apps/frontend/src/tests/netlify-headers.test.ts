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

  it("keeps the Brazil stocks app out of frames but open to search engines", () => {
    const values = headerRules.find(rule => rule.path === "/pt-br/stocks/*")?.values;
    expect(values).toMatchObject({
      "Content-Security-Policy": "frame-ancestors 'none'",
      "X-Frame-Options": "DENY"
    });
    expect(values).not.toHaveProperty("X-Robots-Tag");
  });

  it("does not apply the anti-framing headers beyond the consumer apps", () => {
    expect(headerRules.filter(rule => rule.values["X-Frame-Options"]).map(rule => rule.path)).toEqual(["/pt-br/gold/*", "/pt-br/stocks/*", "/en/stocks/*"]);
  });

  it("protects the English stocks edition and keeps it out of search before activation", () => {
    expect(headerRules.find(rule => rule.path === "/en/stocks/*")?.values).toMatchObject({
      "Content-Security-Policy": "frame-ancestors 'none'",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex"
    });
  });
});
