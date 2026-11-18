# ouro.

Brazil-first consumer pilot for buying and selling PAX Gold with PIX while the user keeps control of an embedded Ethereum wallet.

## What is implemented

- Portuguese landing page and responsive gold dashboard
- Passwordless Privy login with Google first and e-mail under “Outras formas de entrar”, plus automatic embedded Ethereum wallet creation
- Vortex e-mail OTP, refresh-token rotation and concurrent refresh coalescing
- Live Vortex BRL/PIX → PAXG (Ethereum) quote, purchase registration, PIX display, ramp start, status polling and reload recovery
- Brazilian Avenia onboarding: subaccount recovery/creation, ID upload, hosted liveness, KYC submission and provider-status polling
- Explicit fee/slippage disclosure and real on-chain PAXG balance
- PAXG/BRL indicative price chart from CoinGecko; no simulated prices in production
- Encrypted, device-local recovery storage for Vortex ephemeral ramp keys
- Full no-money demo mode for product and mobile QA
- PAXG → BRL/PIX sell flow, explicit ETH-gas funding, wallet confirmations, receipt sequencing and transaction-hash checkpoints for interrupted sessions
- Native Ethereum PAXG availability checked against Vortex's network-specific token list and canonical contract address

## Prepared Base checkout

Ethereum remains the default. `VITE_GOLD_NETWORK=base` selects the code-pinned official PAXG Base deployment. New operations additionally require `VITE_GOLD_BASE_ENABLED=true`; the independent `VITE_GOLD_USDC_ENABLED=true` enables native Base USDC as a payment/settlement choice alongside Pix. The same Privy app and embedded wallet are retained. These are build-time switches, not server enablement.

The Base checkout supports Pix/BRL → PAXG, PAXG → Pix/BRL, native Base USDC → PAXG, and PAXG → native Base USDC. Fiat KYC is invoked only for Pix; Vortex email verification remains required for either rail. USDC goes to the user's own wallet, waits for two confirmations, then requires a fresh quote and explicit authorization. Partial, excess or late funds, sale proceeds and amounts under the 10 USDC minimum remain in that wallet: the dashboard shows the Base USDC balance, which can pay for the next USDC purchase, and offers Privy's wallet export to move it with another app. The app itself sends no USDC, because the embedded wallet holds no ETH for gas on Base. Only an owner-bound amount draft survives an interrupted funding step; quotes and consent are never restored.

Backend acceptance is still required: the canonical PAXG contract must be listed for each rail/direction and the corresponding quote/registration flow must exist. Quote requests carry `paymentMethod` `pix` or `usdc`, and the quote must echo it. USDC requests are same-chain `base` → `base`, never stock-token routes or an Ethereum fallback. Fee strings must have at most 2 decimals in BRL and 6 in USDC, and network, processing and partner fees must add up exactly to the total. Registration must return a Base `destinationTransfer` matching the quote, token, amount and recipient; the ramp's `inputAmount` may be echoed with up to 18 decimals. USDC buys and both sells require `gasless: true` and one user EIP-2612 request in phase `goldPermitTransfer`, with the exact input token/amount, current nonce and client-generated ephemeral spender. The app refuses any other signing contract. This frontend/SDK preparation does not add server executors or enable live routes.

Run `bun run check:base -- --api https://api.vortexfinance.co` for anonymous listing and quote checks before real-wallet acceptance. It exits nonzero when any route is unavailable; `--allow-not-ready` is useful for inspecting the expected disabled state. It moves no funds and is not proof of settlement. Confirm the code-pinned Base token against Paxos' canonical deployment registry before activation: [Paxos Base announcement](https://www.paxos.com/blog/paxg-launches-on-base-bringing-regulated-gold-to-borrowers-on-coinbase), [Coinbase network registry](https://www.coinbase.com/price/pax-gold).

Existing recovery keys and encrypted records remain readable. Untagged records always mean Ethereum; new Base records persist their network and payment method. A new Base build keeps Ethereum in Privy's supported chains, displays prior Ethereum holdings separately, and resumes existing orders on their saved chain. Disabling new Base/USDC orders retains recovery of an already registered, wallet-owned Base order. A Base order that failed, stayed unstarted for an hour, or is a permit order whose 15-minute start window closed leaves the active slot and stays in the history with its code, so it cannot block the next order. Reopening the app never resumes a saved order by itself: the user sees what it was and asks to continue.

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
