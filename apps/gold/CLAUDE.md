# apps/gold - ouro. gold app

Brazil-first consumer app for buying and selling PAX Gold with PIX through `@vortexfi/sdk`,
branded "ouro. by Vortex". Plain JavaScript React 19 + Vite app with Privy embedded wallets;
imported as a snapshot from `pendulum-chain/vortexperiments`, which keeps the pilot history.

- It is served by the frontend Netlify site at `https://www.vortexfinance.co/pt-br/gold/`:
  `apps/frontend/netlify.toml` builds it with Vite `base: "/pt-br/gold/"` and copies
  `dist/client` into the frontend's `dist/client/pt-BR/gold/`, beside the prerendered locale
  pages. The site is locale-first (`/pt-br/business`, `/pt-br/widget`), so future markets go
  to `/es-mx/gold/` etc.; the unprefixed `/gold/` 301s to the Brazilian edition until an
  international landing exists (`apps/frontend/_redirects`).
  Reference public assets through `import.meta.env.BASE_URL`, never as root-relative
  `/brand/...` paths.
- The API base comes from `VITE_SIGNING_SERVICE_PATH`, like the frontend: a path such as
  `/api/production` resolves against the page origin and goes through the site's `/api/*`
  proxy, an absolute URL is used as-is. `VITE_DEMO_MODE` must be `false` for real builds.
- Gold stays on its own tooling: excluded from Biome, tested with `node --test`, no
  TypeScript. Do not reformat it to the monorepo style.
- Browser storage keys are namespaced `satoshi:*` so they do not collide with the widget on
  the shared origin.

Run `bun dev:gold`, `bun build:gold`, or `cd apps/gold && bun run test` from the repository
root. The SDK must be built first (`bun build:sdk`).
