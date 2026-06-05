import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    sourcemap: true,
    target: "esnext"
  },
  define: {
    "process.env": {}
  },
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5175,
    strictPort: true
  }
});
