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
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry"
  },
  webServer: {
    command: "bun x --bun vite --port 5173 --strictPort",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: "http://127.0.0.1:5173"
  }
});
