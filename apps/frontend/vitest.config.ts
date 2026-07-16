import { coverageConfigDefaults, defineConfig } from "vitest/config";

// Dedicated Vitest config so test runs don't load the full Vite build pipeline
// (tanstack router codegen, Sentry upload plugin, tailwind) from vite.config.ts.
export default defineConfig({
  test: {
    coverage: {
      // Keep the denominator to shippable app code: no Playwright support code,
      // Storybook stories, generated files (route tree, contract ABIs), or test infra.
      exclude: [
        ...coverageConfigDefaults.exclude,
        "e2e/**",
        "playwright.config.ts",
        "src/stories/**",
        "src/contracts/**",
        "src/routeTree.gen.ts",
        "src/setupTests.ts",
        "src/test/**"
      ],
      provider: "v8",
      // lcov feeds scripts/coverage-report.ts (root `bun run test:coverage`).
      reporter: ["text-summary", "lcov"],
      // Ratchet floors, set just under the coverage measured when they were
      // last raised (enforced by `bun run test:coverage`, which CI runs).
      // Raise them as tested code grows; never lower them to make CI pass.
      // 2026-07: re-baselined (25→22 lines, 42→38 functions) after the KYC machines
      // and their tests moved to packages/kyc — the moved code is coverage-gated
      // there (see its test:coverage script), so the overall gate did not weaken.
      thresholds: {
        functions: 38,
        lines: 22
      }
    },
    // Dummy values so src/config/supabase.ts (pulled in transitively via services/auth)
    // doesn't throw at import time; keeps the suite hermetic (no real credentials in CI).
    // ".invalid" never resolves, so an accidental real call fails instead of hitting a live project.
    env: {
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
      VITE_SUPABASE_URL: "http://supabase.invalid"
    },
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test/setup.ts"]
  }
});
