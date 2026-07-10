import { defineConfig, devices } from "@playwright/test";

// E2E journeys are non-PR-blocking (see docs/testing-strategy.md): they run nightly in CI
// and locally via `bun test:e2e`. The backend is mocked per-test with page.route, so no
// API server, database, or chain access is needed — only the Vite dev server.
//
// baseURL deliberately omits the app's "/dashboard/" base path: Playwright resolves a
// leading-slash goto() against the origin, not the base, so specs navigate to the full
// "/dashboard/login" instead of silently landing on "/login".
export default defineConfig({
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  retries: process.env.CI ? 2 : 0,
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "on-first-retry"
  },
  webServer: {
    // --host 127.0.0.1 is required: vite's default binds IPv6 ::1 only, which the url check
    // below (and every page.goto) would never reach.
    command: "bun x --bun vite --port 5174 --strictPort --host 127.0.0.1",
    // No env is needed: the dashboard has no Supabase import, VITE_API_URL already defaults
    // to http://localhost:3000 (intercepted per-test) and VITE_WALLETCONNECT_PROJECT_ID
    // falls back to a placeholder in src/lib/wagmi.ts.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: "http://127.0.0.1:5174/dashboard/"
  }
});
