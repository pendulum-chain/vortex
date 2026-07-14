import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Served as a sub-app of the frontend at /dashboard, so it builds into the
  // frontend's publish dir and the same Netlify preview serves both.
  base: "/dashboard/",
  build: {
    emptyOutDir: true,
    outDir: fileURLToPath(new URL("../frontend/dist/dashboard", import.meta.url)),
    target: "esnext"
  },
  // @vortexfi/shared (polkadot/stellar graph) expects process.env to exist, same as the widget.
  define: {
    "process.env": {}
  },
  plugins: [
    {
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url !== "/") {
            next();
            return;
          }

          response.statusCode = 302;
          response.setHeader("Location", "/dashboard/");
          response.end();
        });
      },
      name: "dashboard-dev-root-redirect"
    },
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
