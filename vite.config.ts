import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

import { polyfillNode } from 'esbuild-plugin-polyfill-node';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [preact()],
  esbuild: {
    logOverride: { 'this-is-undefined-in-esm': 'silent' },
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
      plugins: [
        // Enable esbuild polyfill plugins. We use the default settings.
        // see https://github.com/cyco130/esbuild-plugin-polyfill-node?tab=readme-ov-file#options
        polyfillNode({}),
      ],
    },
  },
});
