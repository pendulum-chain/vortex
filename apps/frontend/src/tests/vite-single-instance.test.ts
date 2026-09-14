import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// TanStack Start decides whether to install its SSR dev middleware with
// `isRunnableDevEnvironment(env)`, which is an `instanceof` check. If the plugin resolves a
// different copy of Vite than the one that created the dev server, that check silently fails,
// the middleware is never installed and every dev route falls through to a 404 — the app is
// unreachable locally and the Playwright webServer never becomes ready.
//
// Bun installs a separate copy of Vite per resolved optional-peer set, so this breaks as soon
// as the app and the plugin disagree on one of them (`lightningcss` is why the frontend depends
// on it directly). Compare the resolved module paths rather than trusting the version alone.
const require = createRequire(import.meta.url);

function resolveViteFrom(requirer: NodeRequire): string {
  return realpathSync(requirer.resolve("vite"));
}

describe("Vite module identity", () => {
  it("resolves the same Vite copy for the app and for the TanStack Start plugin", () => {
    const appVite = resolveViteFrom(require);

    const reactStart = createRequire(require.resolve("@tanstack/react-start/package.json"));
    const startPlugin = createRequire(reactStart.resolve("@tanstack/start-plugin-core/package.json"));

    expect(resolveViteFrom(startPlugin)).toBe(appVite);
  });
});
