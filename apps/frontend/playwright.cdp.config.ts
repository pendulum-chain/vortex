import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  forbidOnly: !!process.env.CI,
  projects: [{ name: "cdp-choice", use: { ...devices["Desktop Chrome"] } }],
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  retries: process.env.CI ? 2 : 0,
  testDir: "./e2e",
  testMatch: "wallet-cdp-choice.spec.ts",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:5176",
    trace: "on-first-retry"
  },
  webServer: {
    command: "bun x --bun vite --port 5176 --strictPort --host 127.0.0.1",
    env: {
      VITE_ALCHEMY_API_KEY: "e2e-mock-key",
      VITE_CDP_ENABLED: "true",
      VITE_CDP_EXPORT_ENABLED: "true",
      VITE_CDP_PROJECT_ID: "e2e-public-project-id",
      VITE_CDP_PROVISIONING_ENABLED: "true",
      VITE_CDP_SIGNING_ENABLED: "true",
      VITE_SUPABASE_ANON_KEY: "e2e-mock-anon-key",
      VITE_SUPABASE_URL: "http://supabase.invalid"
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: "http://127.0.0.1:5176/"
  }
});
