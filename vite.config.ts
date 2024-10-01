import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [preact(), nodePolyfills()],
  esbuild: {
    logOverride: { 'this-is-undefined-in-esm': 'silent' },
  },
  build: {
    target: 'esnext',
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
