import { defineConfig, devices } from "@playwright/test";

// E2E journeys are non-PR-blocking (see docs/testing-strategy.md): they run nightly in CI
// and locally via `bun test:e2e`. The backend is mocked per-test with page.route, so no
// API server, database, or chain access is needed — only the Vite dev server.
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
    // A placeholder Alchemy key keeps the frontend-matched transport path active; every endpoint
    // is intercepted per-test. VITE_API_URL defaults to the likewise-intercepted localhost API.
    env: { VITE_ALCHEMY_API_KEY: "e2e-mock-key" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: "http://127.0.0.1:5174/"
  }
});
