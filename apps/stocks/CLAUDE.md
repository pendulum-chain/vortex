# apps/stocks - fatia. Stock Tokens app

Brazil-first consumer showcase of the Vortex API for buying and selling US Stock Tokens on
Robinhood Chain with Pix, branded "fatia. by Vortex". The product name lives in
`src/brand.js`, `public/brand/*` and `index.html`. Plain JavaScript React 19 + Vite app,
the sibling of `apps/gold`.

- It is served by the frontend Netlify site at `https://www.vortexfinance.co/pt-br/stocks/`:
  `apps/frontend/netlify.toml` builds it with Vite `base: "/pt-br/stocks/"` and copies
  `dist/client` into the frontend's `dist/client/pt-BR/stocks/`; `/stocks` 301s there
  (`apps/frontend/_redirects`). It uses hash routes, so no SPA rewrite is needed. In code, reference
  public assets through `import.meta.env.BASE_URL`, never as root-relative `/brand/...` paths (Vite
  rewrites the ones in `index.html`).
- **Indexing:** the Brazil edition (`index.html`, `/pt-br/stocks/*`) is launched and indexed. The
  English edition keeps `<meta name="robots" content="noindex">` in `international.html` and
  `X-Robots-Tag: noindex` for `/en/stocks/*` in `netlify.toml`; remove both only at its launch.
- **Modes:** `VITE_STOCKS_MODE` = `demo` (default when unset: fake login, simulated ramp) |
  `preview` (real Privy login, simulated ramp, no Vortex calls) | `live` (production; the
  Netlify build defaults to it). The Vortex ramp additionally stays off ("em breve") until
  `VITE_STOCKS_RAMP_ENABLED=true`, which is honoured only in `live` and needs a rebuild to change.
  A build fails on a bad mode or missing Privy id, and a Netlify production build (`CONTEXT`) fails
  unless the mode is `live` (`vite.config.mjs`). Staging is a branch deploy on the same site, so
  scope `VITE_STOCKS_RAMP_ENABLED` per context in the Netlify UI, with no branch-deploy override in
  `netlify.toml`. **Never read `VITE_DEMO_MODE`**: that is Gold's flag and production sets it to
  `false`. `tests/pilot-safety.test.mjs` enforces this and the `.env.example` defaults.
- Only `src/lib/config.js` reads `VITE_*` variables here; other files may read
  `import.meta.env.BASE_URL`, `.DEV` and `.PROD`. Every `VITE_*` value set on the site still ships in
  the bundle, because `readConfig` and the shared package's `getEnvVar` read the whole env.
- **Shared login and Vortex plumbing come from `@vortexfi/consumer-kit`**
  ([`packages/consumer-kit/CLAUDE.md`](../../packages/consumer-kit/CLAUDE.md)): the same
  `VITE_PRIVY_APP_ID` as Gold (one Privy user and embedded wallet), the sign-in "Entrar com
  Vortex", the Vortex OTP session under Gold's key, KYC, ramp tracking and wallet signing.
  Only a lazily loaded shell may import `@vortexfi/consumer-kit/privy` or `@privy-io/*`, so
  the landing renders before the Privy chunk; the SDK is only loaded dynamically by the kit.
- Browser storage keys are `satoshi:stocks:*` (via the kit's `appKey`) and must never collide
  with Gold's `satoshi:gold:*` keys.
- Stocks stays on Gold's tooling: excluded from Biome, tested with `node --test`, no TypeScript.
  Do not reformat it to the monorepo style.
- Copy (pt-BR): "Pix", "tokens de ações dos EUA" / "Stock Tokens", always "Robinhood Chain" in
  full, no Robinhood logos, never imply share ownership, explain "token" at first use.

## Library layer (`src/lib`, framework-free, unit-tested)

- `config.js` reads the env once (`readConfig`); `brand.js` (in `src/`) holds name, lockup and colours.
- `stocks.js` is the **bundled allowlist**: 12 launch Stock Tokens (EIP-55 addresses, 18 decimals,
  ISIN, CoinGecko ids), collections, watchlist/not-tokenized names (never with an address), search.
  Change it only together with `tests/stocks-allowlist.test.mjs`, which also compares it with
  `packages/shared/src/tokens/evm/config.ts`, and run `node apps/stocks/scripts/verify-allowlist.mjs`
  (network: RHJ registry, chain and CoinGecko) before a release. Never take addresses from an
  aggregator's token list.
- Money maths is bigint (`token.js`): amounts are floored, "Usar tudo" sells the exact raw balance,
  shares = raw x `uiMultiplier` / 1e18.
- Data: `market.js` (one batched CoinGecko `simple/price` call, 60 s cache, stale up to 15 min),
  `chart.js` (lazy per detail screen, 6 h cache, max 8 series, 429 cool-down), `market-hours.js`
  (NYSE calendar 2026/2027, issuer tokenization window, expected corporate-action pauses),
  `portfolio.js` (one Multicall3 read over an http client on Robinhood Chain, never the Privy provider).
- The UI talks to a ramp only through `ramp-adapter.js`: `vortex-stocks.js` (live; network
  `robinhood` + token symbol, with the bundled address as this app's own pin on the listing, on a
  buy's delivery and on a sell's permit; no API key; gated by `VITE_STOCKS_RAMP_ENABLED`, answers
  "em breve" without any call while off, and also while the API does not know the network or lists no
  direction; quotes validated fail-closed; `mapStocksError` words the API's English in pt-BR) or
  `simulated-ramp.js` (demo/preview; no Vortex or wallet calls, never a Pix code). Adapters own the
  active-ramp store writes and refuse a second operation while the wallet has an unfinished one on
  this device (`assertNoOtherActiveRamp`: the kit keeps ONE recovery record per wallet, and reads the
  single record earlier builds stored); `App` sends every buy or sell request through `flowFor`
  (`detail-actions.js`), so it resumes that operation instead (as Gold). A failed or abandoned ramp
  leaves a history row with its operation code before its record goes (`settleRamp`; a registration
  that never finished, or an expired Pix the user says they did not pay, via `abandonRamp`).
  `price-guard.js` and `phases.js` are pure.
- **Gas reserve (`gas-reserve.js`):** a BUY can include a small ETH reserve, which stays
  in the wallet, when the wallet lacks ETH on Robinhood Chain; a permit sell does not spend it. The
  BUY quote request carries `destinationAddress` (the wallet), and a quote may carry `gasReserveAmount` (ETH, plain decimal),
  `gasReserveCurrency` (`"ETH"`), `gasReserveFiat` and `gasReserveUsd`, already inside
  `networkFeeFiat`/`totalFeeFiat`. `vortex-stocks.js` validates them fail-closed (BUY only, at most
  0.0003 ETH, inside `networkFeeFiat`, processing + partner + network = `totalFeeFiat` within 1
  cent, fees below the amount; `INVALID_FEES`) and maps them to `StockQuote.gasReserve`, with
  `fees.network` excluding it and `fees.total` including it. Absent
  or `"0"` means no reserve, and the quote is validated exactly as before. The simulated ramp mirrors
  the rule (below 0.00002 ETH, top up to 0.00005 ETH) against the demo holdings' ETH, which start at
  0.00001 ETH, so the first demo buy shows the reserve line and later ones do not.
- **Sell gas check before registering:** a registered sell holds the wallet's one operation for up to
  an hour, so a wallet that cannot pay its transfer must be stopped before `registerRamp`. The review
  compares the wallet's ETH with `sellGasRequiredWei` (one transfer's gas limit as Vortex is asked to
  send it, `SELL_GAS_LIMIT` 85,000 = the 77,118 estimate + at most 10 %, x 1.2 x the base
  fee), read by `runtime.readGasPrice()` (`eth_gasPrice`, only in
  the sell flow, never in the 30 s portfolio poll; demo: the 0.02 gwei floor). Never read the base
  fee with Multicall3 `getBasefee()`: it returns 0 inside an `eth_call` on Robinhood Chain. Dust as
  well as 0 ETH keeps "Confirmar venda" disabled; the card names both causes (a used-up reserve or a
  higher fee), offers buying again (it tops a low reserve up; nothing is registered yet) and sending
  ETH to the copyable address shown. A `gasless: true` quote (permit sell) skips the card, and live
  `validateStockQuote` refuses any other sell quote, so the card now only shows in demo and preview.
  Live sells sign one permit (`SELL_PHASES`) for the ephemeral this device generated, kept on the
  recovery record as `ephemeralEvmAddress`, at the token's `nonces(owner)` when the sale is first
  signed, pinned on the same record as `permitNonce`; a re-sign needs the chain to still read it. Every "venda
  e receba no Pix" promise says the fee is covered (`SELL_NETWORK_FEE_PT`;
  `tests/stocks-allowlist.test.mjs`).
- **Resumed sell and the start window:** the API refuses `startRamp` 15 minutes after registration.
  `resumeSell` ("Continuar esta venda") signs nothing from `RESUME_SIGN_MARGIN_MS` (60 s) before
  the deadline on, the earlier of the server's (`startDeadline`) and this device's (the record's
  `createdAt`, taken just before `registerRamp`, + the kit's `RAMP_START_WINDOW_MS`), so a device
  clock running behind the server's never signs late. With no broadcast it clears the abandoned
  record and throws `SELL_EXPIRED`; with any broadcast it retains recovery for support. A sell already
  signed (stage `ready`) gets the same answer once that deadline itself has passed, since the API
  would refuse its start. The API's own refusal past the window, on the update with the permit or on
  `startRamp` (given the wallet), gets the same `SELL_EXPIRED` for this device's sell. Both known
  hashes and uncertain-send markers survive failed or hour-old status for a day from registration
  (`RETAIN_AFTER_SEND_MS`), then move to the history with the code and any hash; a null checkpoint
  after a definite wallet rejection is not a broadcast. When every wallet request
  of it was already broadcast (checkpointed), nothing is signed and the tokens have moved, so the
  window does not apply: it only awaits the receipts and `startRamp` decides.
- Keep the landing path light: `config`, `stocks`, `market`, `market-hours` and `brand` cost about
  20 KB; load `portfolio.js` and `ramp-adapter.js` (viem, about 90 KB gzip each) lazily.
- UI helpers stay here too, so they are tested: `routes.js` (hash routes), `history.js` (local +
  server history rows), `detail-actions.js` (buy/sell button states), `fee-model.js` (illustrative
  round placeholder fees for simulated quotes and the landing example), `demo-verification.js` (demo-only stand-ins
  for the e-mail code, 123456, and KYC; no network, own sessionStorage key), `demo-links.js`
  (demo-only `?demoFlow=` deep links, below), `greeting.js` (greetings without a placeholder name).
- **Direct routing / no product markup:** Relay bridge + Uniswap swap is the
  route. `validateStockQuote` requires the server's `routingStrategy: "direct"` and
  `partnerFeeFiat = 0`. `provider-costs.js` validates and
  renders `providerCosts` (schema in README): `fees` partition reported fees, `rate`
  describes signed price effects embedded in output. Unknown amounts remain unknown. The review
  shows provider rows, Vortex as the only own revenue fee and an explicit zero Stocks surcharge.
  `fees.total` means reported fees, not necessarily the full spread against a fresh market rate.
  Simulated costs are illustrative round placeholders, never a provider's real rates.
- **Base USDC:** English `/en/stocks/` and the Brazil USDC choice ship in all builds. Live execution is independently gated by `VITE_STOCKS_USDC_ENABLED=true` and backend `STOCKS_USDC_ENABLED_DIRECTIONS`; discover with `paymentMethod=usdc`. `LiveUsdcFlow.jsx` waits for two Base confirmations in the user's own wallet, refreshes the quote, then requires explicit approval before an exact-amount source permit. No fiat KYC call is made. `vortex-stocks.js` shares the existing Pix recovery lock, nonce/deadline/maintenance checks and persisted ephemeral keys. Native Base USDC is code-pinned. `USDC_SIMULATION` removes `SimulatedUsdcFlow.jsx` and simulated payment controls from live builds; demo/preview remain fake and never show payable addresses. See README for deployment order and recovery behavior.
- **Maintenance:** the live adapter reads existing public `/v1/maintenance/status` before registration,
  start and each new wallet broadcast. `PixStep` also polls while visible and invalidates a clear
  result on banking-app/background transitions. Unknown, paused, disabled and expired states hide
  QR/copy instructions and disable confirmation; they never clear the recovery record. Simulated
  flows make no status request. Known-hash receipt recovery does not ask for a new signature.
- **Portfolio identity:** snapshots are tagged with wallet and runtime before rendering. Identity
  generations and request order reject late responses, including A→B→A. A same-owner RPC failure
  retains the last good values as stale. `portfolio-hook.test.mjs` inspects every React DOM commit.

## UI (`src/`)

- **Boot (`main.jsx`):** the entry renders the landing with no Privy, SDK, recharts, qrcode, viem
  client or ramp adapter. Lazy chunks: `PrivyShell.jsx` (the only Privy import), `runtime.js`
  (adapter + portfolio read, loaded on sign-in, or signed out on the landing and a detail screen while the
  live ramp is on: its answer decides "Comprar com Pix" vs "em breve"; unknown shows neither),
  `components/PriceChart.jsx` (recharts), `flows/BuyFlow.jsx` / `flows/SellFlow.jsx` (qrcode), and `InternationalApp.jsx` / `flows/UsdcFlow.jsx`.
  `tests/import-boundaries.test.mjs` walks the entry's static import graph and fails if any of
  them (or `@phosphor-icons/react`) becomes eager. Check `dist/client/.vite/manifest.json` after
  a build: the entry has no static imports.
- **Auth:** `DemoAuth.js` (demo) or `PrivyShell.jsx` → the kit's `ConsumerPrivyProvider`, lifted
  into `App` as `ConsumerAuth`. Before Privy is ready, `pendingAuth` queues a sign-in click and
  shows "Abrindo sua conta…" when `privy:token` exists (8 s cap). Before a Google login the hash
  is saved and reset to `#/`, then restored.
- **Routes (`router.js` + `lib/routes.js`):** `#/`, `#/explorar?c=&q=`, `#/acao/<SYMBOL>`,
  `#/historico`. Sign-in, welcome, "Como funciona?", buy and sell are modals (`Modal.jsx`: focus
  trap, Escape, bottom sheet on phones).
- **Screens:** `Landing`, `Home`, `Explore`, `StockDetail`, `History`; flows in `flows/` (Gold's
  state machines over the adapter; `parts.jsx` holds OtpStep, KycStep, ProcessingSteps, FlowIssue,
  the price-guard card). Demo shows every step: code 123456, a prefilled KYC form, a simulated Pix
  box (never a QR code), processing, success; "Reiniciar demonstração" in the account menu resets.
- **Demo deep links (demo builds only):** `#/<route>?demoFlow=login|learn|welcome|buy|buy-quote|sell|sell-reserve-used`
  opens that sheet or flow (signing the demo user in when needed; `buy-quote` skips the demo code
  and KYC and lands on the quote; `sell-reserve-used` skips them too, spends the demo reserve down to
  0.000001 ETH and lands on the blocked sell review for the whole holding), e.g.
  `#/acao/NVDA?demoFlow=buy-quote`. App loads
  `lib/demo-links.js` only behind `DEMO_TOOLS` from `config.js`, which Vite folds to `false` in
  preview/live builds: after a live build, `dist/client/.vite/manifest.json` has no `demo-links`
  entry (CI checks it). Keep that exact `DEMO_TOOLS` expression (`tests/demo-links.test.mjs`).
- **Hero photos:** `public/images/carousel-<name>-{800,1440}.jpg` (the `FairFeesHero` carousel; the
  fair-fees 1440 file is also the OG image) are AI-generated images of fictional people, not stock
  photos or real customers. A replacement keeps that true, or this line records its source and licence.
- **Styles:** `styles.css`; its token block must equal `cssVariables()` from `brand.js`
  (`tests/brand.test.mjs`). Numbers and tickers in DM Mono, prices up/down with ▲/▼ and a sign,
  48 px targets, visible focus, `prefers-reduced-motion` honoured. Ticker tiles, never logos.
- **Icons:** `components/icons.js` is GENERATED (Phosphor paths, weights regular/bold/fill only) by
  `node scripts/build-icons.mjs`; re-run it after importing a new icon name from `icons.js`.

Run `bun dev:stocks` (port 5175), `bun build:stocks`, or `bun run test:stocks` from the
repository root. The SDK must be built first (`bun build:sdk`).
