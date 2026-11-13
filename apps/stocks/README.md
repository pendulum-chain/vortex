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

## Base-USDC checkout

Both builds publish English at `/en/stocks/` and Brazil at `/pt-br/stocks/`. The English edition uses native USDC on Base; Brazil offers it alongside Pix, and a signed-in stock page offers USDC buttons while Pix is closed (not during an issuer pause). The same Privy app, identity and wallet are used for both. The English HTML reuses `/pt-br/stocks/assets/*`, with scoped security/noindex headers.

Live execution needs the platform/SDK extension deployed first, migration 090, backend `STOCKS_USDC_ENABLED_DIRECTIONS=BUY,SELL`, then frontend `VITE_STOCKS_USDC_ENABLED=true` and a rebuild. The frontend flag is independent of Pix's `VITE_STOCKS_RAMP_ENABLED`. Discovery explicitly uses `paymentMethod=usdc`; a disabled direction, unknown asset or mismatched contract cannot quote. No partner secret is shipped to the browser.

The user previews a quote, transfers **native Base USDC into their own wallet**, then reviews a fresh quote and explicitly authorizes the order. The receive address/QR is that wallet, not a Vortex custody deposit. Balance reads wait two Base confirmations. Funding alone never starts a trade: partial, excess and late deposits stay in the wallet; an expired funding intent can be discarded without affecting funds. A changed price/cost is highlighted and every fresh quote needs approval. No customer ETH purchase is needed: the exact-amount EIP-2612 permit is signed on Base for BUY and Robinhood Chain for SELL, and Vortex sponsors execution gas.

`vortex-stocks.js` reuses the existing SDK/recovery/maintenance/nonce policies for both payment methods. Before granting a source permit, it pins the delivery token, chain, wallet, quote, input and exact output, plus the client-generated ephemeral spender. Recovery is saved before keys/signatures. A rejected signature or uncertain start resumes the same order; a potentially sent authorization (the wallet prompt opened) retains recovery even if a failed status arrives, while a declined prompt does not hold the wallet lock. Pix and registered USDC operations share the one-operation wallet lock. History retains USDC units.

Provider costs distinguish reported fees from signed execution-price effects, include the ETH reserve once, and show zero additional product fee. Pix quotes may separately show the configured Nabla DEX-fee subsidy; the Nabla row is already net of it. USDC bypasses both Pix and Nabla and receives no Nabla subsidy. Sending wallets/exchanges may charge independently.

Demo/preview keep `usdc-checkout.js`'s simulated balances and payment controls. They make no funding/trading calls and show no payable address. `USDC_SIMULATION` removes those controls and their lazy chunk from live builds. `node apps/stocks/scripts/verify-usdc-ui.mjs` still checks the demo UI; Node DOM tests additionally exercise the live UI with synthetic adapters. No real Pix bank transfer is required for these checks, and real bank settlement remains unverified.

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
simulated USDC checkout or demo links; the real USDC flow and English entry must be present. A build fails on a bad `VITE_STOCKS_MODE`, and a
Netlify production build fails unless the mode is `live`.

`apps/api/src/tests/corridors/stocks-app.e2e.test.ts` runs this app's real adapter, wallet kit and
SDK against the real API, with a fake chain and a fake wallet.

With the local demo running, `node apps/stocks/scripts/verify-pilot-ui.mjs` uses the existing
Playwright dependency and locally installed Chrome to check desktop and mobile layouts and
a complete simulated purchase. It blocks real ramp endpoints and requires the demo to produce
no payment code. Screenshots and a machine-readable report go to `/tmp/vortex-stocks-ui-qa`;
override that directory with `STOCKS_QA_OUTPUT`.

The Stocks test command runs files sequentially with a 256 MB Node heap. DOM assertions compare booleans/values rather than formatting full DOM/React objects on failure. For local builds and broader checks, use a bounded process monitor and avoid concurrent validation jobs.
