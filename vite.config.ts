import { sentryVitePlugin } from '@sentry/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills(),
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
});
