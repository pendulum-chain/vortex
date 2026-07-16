import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Deployed as its own site (e.g. dashboard.vortexfinance.co), served at the domain root.
  build: {
    emptyOutDir: true,
    target: "esnext"
  },
  // @vortexfi/shared (polkadot/stellar graph) expects process.env to exist, same as the widget.
  define: {
    "process.env": {}
  },
  plugins: [
    // tanstackRouter() must be before react()
    tanstackRouter({ autoCodeSplitting: true, target: "react" }),
    tailwindcss(),
    viteReact()
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  server: {
    port: 5174
  }
});
