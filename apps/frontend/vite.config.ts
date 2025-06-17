import * as path from "path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    sentryVitePlugin({
      org: "satoshipay",
      project: "vortex"
    })
  ],
  esbuild: {
    logOverride: { "this-is-undefined-in-esm": "silent" }
  },
  build: {
    target: "esnext",
    sourcemap: true
  },
  // @ts-ignore
  test: {
    globals: true,
    testTimeout: 15000
  },
  resolve: {
    alias: {
      shared: path.resolve(__dirname, "../shared/dist/esm/index.js")
    }
  },
  server: {
    host: true
  }
});
