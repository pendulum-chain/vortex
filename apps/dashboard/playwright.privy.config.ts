import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  forbidOnly: !!process.env.CI,
  projects: [{ name: "privy-choice", use: { ...devices["Desktop Chrome"] } }],
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  retries: process.env.CI ? 2 : 0,
  testDir: "./e2e",
  testMatch: "wallet-privy-choice.spec.ts",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:5175",
    trace: "on-first-retry"
  },
  webServer: {
    command: "bun x --bun vite --port 5175 --strictPort --host 127.0.0.1",
    env: {
      VITE_ALCHEMY_API_KEY: "e2e-mock-key",
      VITE_PRIVY_APP_ID: "e2e-public-app-id",
      VITE_PRIVY_ENABLED: "true",
      VITE_PRIVY_OFFRAMP_ENABLED: "true",
      VITE_PRIVY_ONRAMP_ENABLED: "true",
      VITE_PRIVY_PROVISIONING_ENABLED: "true"
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: "http://127.0.0.1:5175/"
  }
});
