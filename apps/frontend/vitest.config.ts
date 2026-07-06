import { defineConfig } from "vitest/config";

// Dedicated Vitest config so test runs don't load the full Vite build pipeline
// (tanstack router codegen, Sentry upload plugin, tailwind) from vite.config.ts.
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      // Ratchet floors, set just under the coverage measured when they were
      // last raised (enforced by `bun run test:coverage`, which CI runs).
      // Raise them as tested code grows; never lower them to make CI pass.
      thresholds: {
        functions: 41,
        lines: 19
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
