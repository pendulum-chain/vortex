import { defineConfig } from "vitest/config";

// Dedicated Vitest config so test runs don't load the full Vite build pipeline
// (tanstack router codegen, Sentry upload plugin, tailwind) from vite.config.ts.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"]
  }
});
