import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { publicKeyError } from "./src/lib/config.js";

export default defineConfig(({ mode }) => {
  // Vite inlines every VITE_* value into the public bundle: a secret key fails the build instead.
  const keyError = publicKeyError(loadEnv(mode, process.cwd(), "VITE_").VITE_VORTEX_PUBLIC_KEY);
  if (keyError) throw new Error(keyError);
  return {
    base: "/pt-br/stocks/",
    build: {
      outDir: "dist/client",
      manifest: true,
      rollupOptions: { input: { main: "index.html", international: "international.html" } },
    },
    resolve: {
      // One copy of each, shared with @vortexfi/consumer-kit (a workspace package with peers).
      dedupe: ["react", "react-dom", "@privy-io/react-auth", "viem", "@vortexfi/sdk"],
    },
    optimizeDeps: {
      include: ["react", "react-dom/client"],
    },
    server: {
      host: "0.0.0.0",
      port: 5175,
      warmup: {
        clientFiles: ["./src/main.jsx"],
      },
      proxy: {
        // Mirrors apps/frontend/_redirects, so local live mode needs no API CORS entry.
        "/api/production": { target: "https://api.vortexfinance.co", changeOrigin: true, rewrite: (path) => path.replace(/^\/api\/production/, "") },
        // Optional: serve Gold on the same local origin to see the shared Privy session (ports are different origins).
        ...(process.env.STOCKS_DEV_PROXY_GOLD ? { "/pt-br/gold": { target: process.env.STOCKS_DEV_PROXY_GOLD, ws: true } } : {}),
      },
    },
    plugins: [{ name: "stocks-international-path", configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (/^\/en\/stocks\/?(?:\?|$)/.test(req.url || "")) req.url = "/pt-br/stocks/international.html";
        next();
      });
    }, configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (/^\/en\/stocks\/?(?:\?|$)/.test(req.url || "")) req.url = "/pt-br/stocks/international.html";
        next();
      });
    } }, react()],
  };
});
