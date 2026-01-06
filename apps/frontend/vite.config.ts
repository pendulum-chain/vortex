import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import * as path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    sourcemap: true,
    target: "esnext"
  },
  define: {
    "process.env": {}
  },
  esbuild: {
    logOverride: { "this-is-undefined-in-esm": "silent" }
  },
  plugins: [
    // tanstackRouter() must be before react()
    tanstackRouter({
      autoCodeSplitting: true,
      target: "react"
    }),
    react(),
    tailwindcss(),
    sentryVitePlugin({
      org: "satoshipay",
      project: "vortex"
    })
  ],
  resolve: {
    alias: {
      shared: path.resolve(__dirname, "../shared/dist/esm/index.js")
    }
  },
  server: {
    host: true
  }
});
