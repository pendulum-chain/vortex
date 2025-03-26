import { defineConfig } from 'vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import react from '@vitejs/plugin-react';
// @ts-ignore
import tailwindcss from '@tailwindcss/vite';

import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills(),
    tailwindcss(),
    sentryVitePlugin({
      org: 'satoshipay',
      project: 'vortex',
    }),
  ],
  esbuild: {
    logOverride: { 'this-is-undefined-in-esm': 'silent' },
  },
  build: {
    target: 'esnext',
    sourcemap: true,
  },
  // @ts-ignore
  test: {
    globals: true,
    environment: 'happy-dom',
    testTimeout: 15000,
  },
  optimizeDeps: {
    exclude: [],
    esbuildOptions: {
      // Node.js global to browser globalThis
      define: {
        global: 'globalThis',
      },
      target: 'esnext',
      supported: {
        bigint: true,
      },
      plugins: [],
    },
  },
  resolve: {
    alias: {
      shared: path.resolve(__dirname, '../shared/src'),
    },
  },
});
