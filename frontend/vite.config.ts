import * as path from 'path';
import { defineConfig } from 'vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
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
  resolve: {
    alias: {
      shared: path.resolve(__dirname, '../shared/dist/esm/index.js'),
    },
  },
});
