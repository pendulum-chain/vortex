# fatia.

Brazil-first consumer showcase of the Vortex API: buy and sell US Stock Tokens on Robinhood
Chain with Pix, while the user keeps control of an embedded wallet. Same sign-in ("Entrar com
Vortex") and the same wallet as ouro. (`apps/gold`).

Status: in development, and not indexed until launch. Production builds run in `live` mode with
the Vortex ramp off ("em breve") until `VITE_STOCKS_RAMP_ENABLED=true`, and the API's stock corridor
stays off until its `STOCKS_ENABLED_DIRECTIONS` lists a direction.

The frontend Netlify deployment includes this app at `/pt-br/stocks/`. Deploy previews
explicitly use the labelled demo; they do not need a separate wallet or ramp integration.

## Routing and costs

The route bridges Base USDC to Robinhood Chain USDG through Relay, then swaps to the Stock Token
through Uniswap. Stocks adds no surcharge. Live costs come from the Vortex quote; the frontend never
overrides them.

The review shows Avenia (Pix), Nabla (conversion), Relay (bridge), Uniswap (stock swap), Vortex,
network gas and the separate ETH reserve. The extra Stocks fee is explicitly zero. Demo prices and
all simulated costs are illustrative round placeholders; they mirror no provider's rates.

A quote response carries these fields:

```json
{
  "routingStrategy": "direct",
  "partnerFeeFiat": "0.00",
  "providerCosts": [
    { "id": "ramp", "provider": "avenia", "amountFiat": "1.00", "includedIn": "fees" },
    { "id": "conversion", "provider": "nabla", "amountFiat": "1.00", "includedIn": "rate" },
    { "id": "bridge", "provider": "relay", "amountFiat": "1.00", "includedIn": "rate" },
    { "id": "swap", "provider": "uniswap", "amountFiat": "1.00", "includedIn": "rate" },
    { "id": "vortex", "provider": "vortex", "amountFiat": "1.00", "includedIn": "fees" },
    { "id": "network", "provider": "network", "amountFiat": "1.00", "includedIn": "fees" }
  ]
}
```

All amounts are BRL and snapshot the same executable quote. These numbers illustrate the schema;
they are round placeholders, not tariffs. `fees` rows partition `totalFeeFiat` excluding the ETH
reserve; `rate` rows describe signed price effects already in the output rate, outside the reported
fees. The above example would have `totalFeeFiat=3.00` without a reserve, and identified fees plus
rate effects of R$6.00. No amount is deducted again in the frontend. Negative rate effects represent favourable
execution. Reserve fields keep their existing inclusion rules. Complete details must reconcile;
missing costs show “Não discriminado”, never zero, and no complete-cost total is invented.
Quote validation rejects an unconfirmed/direct-routing mismatch, any non-zero partner fee and
malformed breakdowns. Pending registered operations remain recoverable. Progress comes from the
server's phases (`src/lib/phases.js`; `tests/phases.test.mjs` reads the shared phase union).

## Simulated USDC checkout

Demo and preview builds also simulate paying with USDC on Base: `/pt-br/stocks/` offers it as a
second option, and an English edition at `/en/stocks/` offers only it, with USD and USDC amounts. A
live build has none of this: no option, no link, no English page and no chunk. `USDC_CHECKOUT` in
`src/lib/config.js` drops the code from a live build, the screens decide by `config.mode`, and CI's
live-bundle step checks the result.

The simulation does not call a wallet, show a payable address, generate a real QR code or make any
funding or trading API call. There is no URL or environment flag that turns it into a live adapter.

`src/lib/usdc-checkout.js` is the framework-free checkout seam. It uses integer USDC (6 decimals)
and token (18 decimals) arithmetic, rejects stale prices, stores wallet-bound orders, deduplicates
receipts, preserves partial/excess/late deposits and settles idempotently after reload. Pix and
USDC share the existing one-order recovery lock. After funding, a fresh quote must satisfy the
displayed minimum output (0.5% tolerance) and maximum cost (quoted cost + 5 bps of order value).
An explicit updated-price approval applies to the displayed quote, not an unseen worse one.
Reported costs include the reserve exactly once; there is no additional product fee. Simulated
selling returns Base USDC, which can fund another purchase. Demo holdings share the Pix portfolio;
preview holdings and USDC funds are wallet-scoped. Crypto history retains USDC units.

Run `node apps/stocks/scripts/verify-usdc-ui.mjs` against local port 5176 (or set
`STOCKS_PREVIEW_ORIGIN`) for desktop/mobile English UI, cost disclosure, partial deposits, reload
recovery, cross-payment locking, buy/sell, balance reuse and the Brazil payment choice. It blocks
real funding, trading and price APIs. Reports default to `/tmp/stocks-usdc-ui-qa`.

A non-live build emits the English HTML alongside the Brazil app, and it reuses the
`/pt-br/stocks/assets/*` bundles. Netlify copies it to `/en/stocks/index.html` when the build emitted
it, under scoped security and noindex headers. Vite maps the same English path locally. No separate
login, Privy app or wallet is created for English users. Base is added to Stocks' supported chains
only; Gold is unchanged.

## Local run

```bash
cp .env.example .env.local
bun install
bun run dev
```

The checked-in defaults run the no-money demo (`VITE_STOCKS_MODE=demo`) on
`http://localhost:5175/pt-br/stocks/`. In the demo you can walk through every screen and flow:
sign in (simulated), buy (the e-mail code is `123456`, the KYC form is prefilled, the Pix is a
simulation with no code), sell, history. "Reiniciar demonstração" in the account menu starts over.
The first demo buy also shows the "Reserva de ETH na sua carteira" line: a small amount of
ETH on Robinhood Chain, bought with the tokens, that stays in the wallet. Once it has arrived, later
buys do not include it.

To share one screen of the demo, add `?demoFlow=` to the route: `login`, `learn` ("Como
funciona?"), `welcome`, `buy`, `buy-quote` (straight to the quote) or `sell`, for example
`http://localhost:5175/pt-br/stocks/#/acao/NVDA?demoFlow=buy-quote`. These links exist only in
demo builds.

## Configuration

See `.env.example` and `CLAUDE.md` for the modes. The Privy App ID is public and must equal
Gold's. Never add the Privy App Secret, a Vortex `sk_*` key or an unrestricted RPC key to
any `VITE_*` variable: everything in them ships in the browser bundle.

## Repeatable pilot checks

From the repository root, run `bun run test:stocks`, `bun run test:consumer-kit` and
`bun run build:stocks`. The Node tests include fee accounting, the simulated USDC checkout's
stale-price rejection, quote expiry, recovery, wallet signing limits, and the gated live ramp.
`bun run build:stocks` builds the demo by default. CI also runs
`VITE_STOCKS_MODE=live VITE_PRIVY_APP_ID=x bun run build:stocks` and fails if the result has the
USDC checkout, the English page or the demo links. A build fails on a bad `VITE_STOCKS_MODE`, and a
Netlify production build fails unless the mode is `live`.

`apps/api/src/tests/corridors/stocks-app.e2e.test.ts` runs this app's real adapter, wallet kit and
SDK against the real API, with a fake chain and a fake wallet.

With the local demo running, `node apps/stocks/scripts/verify-pilot-ui.mjs` uses the existing
Playwright dependency and locally installed Chrome to check desktop and mobile layouts and
a complete simulated purchase. It blocks real ramp endpoints and requires the demo to produce
no payment code. Screenshots and a machine-readable report go to `/tmp/vortex-stocks-ui-qa`;
override that directory with `STOCKS_QA_OUTPUT`.
