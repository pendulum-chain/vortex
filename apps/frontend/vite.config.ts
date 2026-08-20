import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import * as path from "path";
import { defineConfig } from "vite";

// Marketing routes are static, so they are prerendered to HTML at build time and served by
// Netlify as plain files. The widget/ramp routes opt out of SSR in their route definitions
// and are served from the SPA shell instead.
const MARKETING_ROUTES = [
  "/",
  "/business",
  "/payments",
  "/contact",
  "/privacy-policy",
  "/terms-and-conditions",
  "/terms-and-conditions-full"
];

// The locale segment is optional (`{-$locale}`), so the unprefixed paths and each explicit
// locale prefix all resolve to real pages and each needs its own prerendered file.
const LOCALE_PREFIXES = ["", "/en", "/pt-BR"];

const prerenderPages = LOCALE_PREFIXES.flatMap(prefix =>
  MARKETING_ROUTES.map(route => {
    // The locale root needs the prefix on its own: "/en" + "/" would ask for "/en/", which is
    // not a path the route tree emits. Without a prefix the root stays "/".
    const isLocaleRoot = route === "/";
    return { path: isLocaleRoot ? prefix || "/" : `${prefix}${route}` };
  })
);

export default defineConfig({
  build: {
    // "hidden" uploads source maps to Sentry without leaving sourceMappingURL
    // comments in the shipped bundles.
    sourcemap: "hidden",
    target: "esnext"
  },
  environments: {
    // Browser-only libraries expect `process.env` to exist. Scoped to the client so the
    // server/prerender build keeps the real `process.env`.
    client: {
      define: {
        "process.env": {}
      }
    }
  },
  esbuild: {
    logOverride: { "this-is-undefined-in-esm": "silent" }
  },
  plugins: [
    // tanstackStart() must be before react()
    tanstackStart({
      pages: prerenderPages,
      prerender: {
        // i18next is a module-level singleton whose language is switched per route, so pages
        // must be rendered one at a time to avoid them racing over the active language.
        concurrency: 1,
        crawlLinks: false,
        enabled: true,
        failOnError: true
      },
      router: {
        autoCodeSplitting: true
      },
      // The widget route opts out of SSR, so it is served from this prerendered shell.
      // `maskPath` must stay off the prerender list above: pages are deduplicated by path and
      // the shell is appended last, so sharing "/" would replace the prerendered landing page.
      spa: {
        enabled: true,
        maskPath: "/widget",
        prerender: {
          outputPath: "/_shell"
        }
      }
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
