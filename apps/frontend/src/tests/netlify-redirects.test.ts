import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const redirects = readFileSync(new URL("../../_redirects", import.meta.url), "utf8")
  .split("\n")
  .map(line => line.trim())
  .filter(line => line && !line.startsWith("#"))
  .map(line => {
    const [from, to, status] = line.split(/\s+/);
    return { from, status, to };
  });

describe("Netlify redirects", () => {
  it("routes only the widget shell and the gold alias through lowercase Portuguese paths", () => {
    expect(redirects.filter(rule => rule.from.startsWith("/pt-br"))).toEqual([
      { from: "/pt-br/widget", status: "200", to: "/_shell.html" },
      { from: "/pt-br/gold", status: "200", to: "/gold/index.html" },
      { from: "/pt-br/gold/*", status: "200", to: "/gold/:splat" }
    ]);
  });

  it("keeps unknown paths on the real 404 fallback", () => {
    expect(redirects).toContainEqual({ from: "/*", status: "404", to: "/404.html" });
  });
});
