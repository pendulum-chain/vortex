import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Globe } from "../components/Globe";
import { useEvmTokensLoaded } from "../hooks/useEvmTokensLoaded";
import { storageService } from "../services/storage/local";

// This suite deliberately keeps the config's default "node" environment: it is the same DOM-less
// environment the marketing routes are prerendered in. Each case guards a browser-global access
// that crashed the prerender before it was fixed. Do not add a jsdom environment docblock here —
// vitest scans the whole file for that pragma, so even mentioning it in a comment opts the suite
// into a DOM and makes every assertion below vacuous.

describe("storageService without a DOM", () => {
  it("falls back to the default instead of throwing a ReferenceError", () => {
    expect(storageService.get("anyKey", "fallback")).toBe("fallback");
    expect(storageService.get("anyKey")).toBeUndefined();
  });

  it("returns defaults from getParsed", () => {
    expect(storageService.getParsed("anyKey", { a: 1 })).toEqual({ a: 1 });
  });

  it("reads booleans and numbers as empty", () => {
    expect(typeof localStorage).toBe("undefined");
    expect(storageService.getBoolean("anyKey")).toBe(false);
    expect(storageService.getNumber("anyKey")).toBeNaN();
  });

  it("makes writes and removals no-ops", () => {
    expect(() => storageService.set("anyKey", "value")).not.toThrow();
    expect(() => storageService.remove("anyKey")).not.toThrow();
  });
});

describe("useEvmTokensLoaded without a DOM", () => {
  it("has a server snapshot, so useSyncExternalStore can render it", () => {
    const Probe = () => <span>{String(useEvmTokensLoaded())}</span>;
    expect(renderToString(<Probe />)).toContain("false");
  });
});

describe("Globe without a DOM", () => {
  const html = renderToString(<Globe />);

  it("renders without reading window", () => {
    expect(html).toContain("<canvas");
  });

  it("sizes the canvas from CSS at every breakpoint, so hydration cannot shift the layout", () => {
    // An inline pixel height was the regression: it pinned the server render to the desktop size
    // and the mobile client then re-sized it on hydration.
    expect(html).not.toMatch(/style="[^"]*height:\s*\d/);
    expect(html).toContain("sm:h-[780px]");
    expect(html).toContain("lg:h-[960px]");
  });
});
