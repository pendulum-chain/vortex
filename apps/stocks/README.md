# fatia.

Brazil-first consumer showcase of the Vortex API: buy and sell US Stock Tokens on Robinhood
Chain with Pix, while the user keeps control of an embedded wallet. Same sign-in ("Entrar com
Vortex") and the same wallet as ouro. (`apps/gold`).

Status: in development. Production builds run in `live` mode with the Vortex ramp off
("em breve") and are not indexed until Vortex supports Robinhood Chain.

The frontend Netlify deployment includes this app at `/pt-br/stocks/`. Deploy previews
explicitly use the labelled demo; they do not need a separate wallet or ramp integration.
The existing launch universe is retained; the quote experiment initially samples ten titles.

## Routing and costs

The proposed route bridges Base USDC to Robinhood Chain USDG through Relay, then swaps to the
Stock Token through Uniswap. Stocks adds no surcharge. Live costs must come from the Vortex
quote; the frontend never overrides them.

The review shows Avenia (Pix), Nabla (conversion), Relay (bridge), Uniswap (stock swap), Vortex,
network gas and the separate ETH reserve. The extra Stocks fee is explicitly zero. Demo prices
are illustrative; they do not imply a provider agreement or live routing availability.

Before enabling the live ramp, Vortex must confirm these proposed quote-response additions:

```json
{
  "routingStrategy": "direct",
  "partnerFeeFiat": "0.00",
  "providerCosts": [
    { "id": "ramp", "provider": "avenia", "amountFiat": "0.76", "includedIn": "fees" },
    { "id": "conversion", "provider": "nabla", "amountFiat": "1.50", "includedIn": "rate" },
    { "id": "bridge", "provider": "relay", "amountFiat": "0.50", "includedIn": "rate" },
    { "id": "swap", "provider": "uniswap", "amountFiat": "0.50", "includedIn": "rate" },
    { "id": "vortex", "provider": "vortex", "amountFiat": "0.50", "includedIn": "fees" },
    { "id": "network", "provider": "network", "amountFiat": "0.30", "includedIn": "fees" }
  ]
}
```

All amounts are BRL and snapshot the same executable quote. These numbers illustrate the schema,
not actual tariffs. `fees` rows partition `totalFeeFiat` excluding the ETH reserve; `rate` rows
describe signed price effects already in the output rate, outside the reported fees. The above
example would have `totalFeeFiat=1.56` without a reserve, and identified fees plus rate effects of
R$4.06. No amount is deducted again in the frontend. Negative rate effects represent favourable
execution. Reserve fields keep their existing inclusion rules. Complete details must reconcile;
missing costs show “Não discriminado”, never zero, and no complete-cost total is invented.
Quote validation rejects an unconfirmed/direct-routing mismatch, any non-zero partner fee and
malformed breakdowns. Pending registered operations remain recoverable. Proposed progress names
`relayBridge` requires backend confirmation; `uniswapApprove` and `uniswapSwap` already exist in
the shared phase union, but their use in this route still requires confirmation. Older phase
aliases remain readable for recovery.

## International USDC checkout

USDC on Base is a second frontend payment method independent of the fiat rails. `/en/stocks/`
uses English and USD/USDC amounts; `/pt-br/stocks/` retains Pix and exposes the simulated
USDC checkout as a second option.
Bank payment is labelled
“Bank transfer — planned” until its corridor is actually scheduled and available.

Implemented simulated experience: choose stock and USDC amount → review estimate and provider costs → pay
from a connected wallet or send USDC from a wallet/exchange → detect confirmed funds → obtain
a fresh executable quote → execute within the user's approved price/deadline bounds → show
Stock Tokens in the existing Privy wallet. Users already holding USDC skip the deposit step.
The execution route remains Relay → Robinhood USDG → Uniswap → Stock Token. Selling should
return Base USDC via the reverse route, with an explicit withdrawal option.

For manual funding, prefer receiving USDC in the user's controlled embedded Base wallet (or a
user-controlled dedicated funding account), not a generic Relay depository contract. An
exchange withdrawal can take minutes, longer than a bridge or stock quote. The first screen is
therefore indicative; funding does not lock the stock price. On arrival, execute automatically
only under the user's explicit amount, minimum-output, fee and deadline authorization. A worse
quote requires a new confirmation. Partial/excess or late deposits remain available as funds;
never mark a purchase complete just because a user clicked “paid” or closed a funding modal.
Any post-bridge failure must preserve and disclose the actual recovered asset (e.g. USDG).

Backend dependencies: a crypto-to-crypto quote/order lifecycle separate from the current
fiat BUY/SELL contract; confirmed-deposit tracking and idempotent execution/recovery; source and
destination gas funding; and collection/disclosure of the single Vortex service fee in USDC.
No additional Stocks, Relay-app or swap-integrator markup. The existing BRL BUY partner config
does not by itself price or collect fees on this new path. Do not promise gasless execution
until the required gas funding/sponsorship is configured and tested.

The installed Privy React SDK exposes `useFundWallet`; its newer documented `useDepositFunds`
hook is not exported by the installed version. Do not silently upgrade or change the shared
Gold authentication. A custom receive/QR screen can use the existing embedded wallet, and the
funding UI can be added behind the Privy lazy boundary. If evaluating the newer deposit API,
check source-chain app-pays gas sponsorship, provider routing/fees and wallet-automation effects
first; unrestricted automatic cross-chain routing must not reintroduce LI.FI fees.

Acceptance checks before activation: correct USDC contract and chain, confirmations/reorgs,
partial/duplicate/late payments, expired or worse stock quotes, reload/closed-tab recovery,
gas funding failure, bridge-complete/swap-failed recovery, and sell-to-USDC withdrawal. These
are covered by unit/browser tests where applicable to the simulation. Real confirmation/reorg
monitoring and post-bridge failure recovery belong to the unimplemented Vortex backend.

`src/lib/usdc-checkout.js` is the framework-free checkout seam. It uses integer USDC (6 decimals)
and token (18 decimals) arithmetic, validates fresh prices, stores wallet-bound orders, deduplicates
receipts, preserves partial/excess/late deposits and settles idempotently after reload. Pix and
USDC share the existing one-order recovery lock. After funding, a fresh quote must satisfy the
displayed minimum output (0.5% tolerance) and maximum cost (quoted cost + 5 bps of order value).
An explicit updated-price approval applies to the displayed quote, not an unseen worse one.
Reported costs include the reserve exactly once; there is no additional product fee. Simulated
selling returns Base USDC, which can fund another purchase. Demo holdings share the Pix portfolio;
preview holdings and USDC funds are wallet-scoped. Crypto history retains USDC units.

**Live USDC execution is deliberately disabled.** No arbitrary API endpoint or SDK method was
invented for Vortex. The simulation does not call a wallet, show a payable address, generate a
real QR code or make any funding/trading API call. Real production users see the route's
coming-soon state until the backend quote/order/fee contract is implemented. There is no URL or
environment flag that turns this simulation into a live execution adapter.

Run `node apps/stocks/scripts/verify-usdc-ui.mjs` against local port 5176 (or set
`STOCKS_PREVIEW_ORIGIN`) for desktop/mobile English UI, cost disclosure, partial deposits, reload
recovery, cross-payment locking, buy/sell, balance reuse and the Brazil payment choice. It blocks
real funding, trading and price APIs. Reports default to `/tmp/stocks-usdc-ui-qa`.

The English HTML is built alongside the Brazil app and reuses its `/pt-br/stocks/assets/*`
bundles. Netlify copies the English document to `/en/stocks/index.html` with scoped security and
noindex headers. Vite maps the same English path locally. No separate login, Privy app or wallet
is created for English users. Base is added to Stocks' supported chains only; Gold is unchanged.

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
The first demo buy also shows the "Reserva de rede para vender depois" line: a small amount of
ETH on Robinhood Chain, bought with the tokens, that pays the network fee of later sells. Once it
has arrived, later buys do not include it.

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
`bun run build:stocks`. The Node tests include fee accounting, stale-price rejection,
quote expiry, recovery, wallet signing limits, and the disabled live ramp.

With the local demo running, `node apps/stocks/scripts/verify-pilot-ui.mjs` uses the existing
Playwright dependency and locally installed Chrome to check desktop and mobile layouts and
a complete simulated purchase. It blocks real ramp endpoints and requires the demo to produce
no payment code. Screenshots and a machine-readable report go to `/tmp/vortex-stocks-ui-qa`;
override that directory with `STOCKS_QA_OUTPUT`.

For the historical LI.FI baseline only, `node apps/stocks/scripts/quote-pilot.mjs --out /tmp/stocks-quotes.json`
performs a read-only quote comparison for ten allowlisted tokens at R$1,000. It does not choose
the pilot's execution route. Use `--symbols NVDA --sizes 250,1000,5000`
for a ticket-size comparison. It requests a Vortex BRL→Base USDC quote, passes that exact output
into one LI.FI route, and compares token output with fresh issuer token-adjusted bid/ask prices.
It never registers a ramp or signs a transaction. Included fees are not counted twice;
source gas is added separately. Estimated output and the slippage minimum get separate verdicts.
FX is inferred from Vortex's fee conversion, so an independent fresh BRL/USD benchmark and an
executed settlement remain necessary before claiming a realised whole-journey price.
Keep generated quote reports outside this public repository.
