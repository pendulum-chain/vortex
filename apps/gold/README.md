# ouro.

Brazil-first consumer pilot for buying and selling PAX Gold with PIX while the user keeps control of an embedded Ethereum wallet.

## What is implemented

- Portuguese landing page and responsive gold dashboard
- Passwordless Privy login with WhatsApp first, Google second and e-mail under “Outras formas de entrar”, plus automatic embedded Ethereum wallet creation
- Vortex e-mail OTP, refresh-token rotation and concurrent refresh coalescing
- Live Vortex BRL/PIX → PAXG (Ethereum) quote, purchase registration, PIX display, ramp start, status polling and reload recovery
- Brazilian Avenia onboarding: subaccount recovery/creation, ID upload, hosted liveness, KYC submission and provider-status polling
- Explicit fee/slippage disclosure and real on-chain PAXG balance
- PAXG/BRL indicative price chart from CoinGecko; no simulated prices in production
- Encrypted, device-local recovery storage for Vortex ephemeral ramp keys
- Full no-money demo mode for product and mobile QA
- PAXG → BRL/PIX sell flow, explicit ETH-gas funding, wallet confirmations, receipt sequencing and transaction-hash checkpoints for interrupted sessions
- Native Ethereum PAXG availability checked against Vortex's network-specific token list and canonical contract address

## Local run

```bash
cp .env.example .env.local
bun install
bun run dev -- --host 0.0.0.0 --port 4173
```

The checked-in defaults run the safe demo. Use OTP `123456` in demo mode.

## Production configuration

Set `VITE_DEMO_MODE=false` and build with `bun run build`. The browser integration authenticates state-changing Vortex requests with the user's bearer session obtained through e-mail OTP. A `pk_live_*` public value is optional for partner attribution, discount eligibility and public-key-only readiness reads; it is not a substitute for the user's bearer session. Never add the Privy App Secret or a Vortex `sk_*` key to any `VITE_*` variable.

The frontend never receives the Privy App Secret or a Vortex server secret. Vortex session tokens remain in session storage; CPF and identity documents are not persisted by the app.

Live deployment: [https://www.vortexfinance.co/pt-br/gold/](https://www.vortexfinance.co/pt-br/gold/), built and served by the frontend Netlify site (see `apps/frontend/netlify.toml` and `CLAUDE.md` here). The pilot evidence, deployment notes and production checklist from the standalone `gold.satoshipay.io` release stay in `pendulum-chain/vortexperiments`.
