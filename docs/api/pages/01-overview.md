# Overview

Vortex is a cross-border payments gateway that moves value between fiat currencies and crypto assets. It coordinates quoting, cross-chain swaps via XCM, anchor settlement, and payout across networks such as Base, Polygon, Ethereum, Arbitrum, BSC, Avalanche, Pendulum, Stellar, Moonbeam, AssetHub, and Hydration.

These docs are written for partner developers integrating Vortex into a backend, wallet, checkout flow, or operations dashboard. The endpoint reference documents the raw API surface; the guide pages explain the recommended integration sequence and the responsibilities that sit on the API client side.

## Supported Corridors

The current SDK release supports BRL/PIX flows plus bank-transfer corridors for USD (ACH), MXN (SPEI), COP (ACH), and ARS (CBU) through Vortex's local payment partners, where enabled by country and route configuration. These four corridors support buys and sells on EVM networks; AssetHub is not available for them. EUR onramp endpoints exist on the API surface but the SDK throws `"Euro onramp handler not implemented yet"`; SEPA buy flows are not production-ready today. Other fiat currencies are exposed through reference data endpoints and are added incrementally.

For crypto, Vortex supports USDC and USDT across the listed EVM networks plus USDC on AssetHub. Stablecoin pegs and routes are subject to liquidity on the Nabla AMM and the wider Pendulum/Hydration corridor.

## How A Ramp Flows

Every Vortex ramp follows the same shape:

1. **Quote** — your application requests pricing for a route.
2. **Register** — your application creates per-chain ephemeral accounts and submits their public addresses with the quote ID. Vortex returns one or more **unsigned** transactions that move funds through the ramp.
3. **Sign and update** — your application signs each unsigned transaction with the correct key (ephemeral key for SDK-controlled accounts, user wallet for the user's funds) and submits the signed payloads back to Vortex.
4. **Settle fiat** — for BRL buys, the user pays a PIX QR; for BRL sells, Vortex pays out to the user's PIX key after settlement.
5. **Start** — your application calls start once signatures and fiat payment are in place.
6. **Track** — Vortex drives the on-chain phase machine. Your application listens via webhooks or polls the ramp status endpoint.

The SDK wraps steps 2, 3, and parts of 5 for supported flows. Direct API integrations must implement them explicitly.

## Recommended Integration Paths

| Stack / use case | Recommended path |
|---|---|
| Trusted Node.js backend | `@vortexfi/sdk` |
| Python backend | `vortex-sdk-python` (process-bridge wrapper around the Node SDK) |
| Browser / mobile / hosted checkout | Vortex Widget |
| Any other language or runtime | Direct API integration following the SDK's behavior |

The SDK is intended for **trusted server-side Node.js** only. Browser support is not enabled. For browser-driven UX, embed the Widget instead of calling the API directly from the browser.

## Custody Model

Vortex does not custody user private keys. During a ramp, short-lived blockchain accounts called **ephemeral accounts** hold funds in transit. Vortex receives their public addresses; their secret keys never leave the SDK or your API client.

This boundary is non-negotiable: if ephemeral secrets are lost while a ramp is in flight, recovery may be impossible for that ramp. See [Ephemeral Key Custody](https://api-docs.vortexfinance.co/ephemeral-key-custody).

## Next Steps

- New integrators: [Quick Start With The SDK](https://api-docs.vortexfinance.co/quick-start-with-the-sdk).
- Building for a non-Node stack: [AI Agent Integration](https://api-docs.vortexfinance.co/ai-agent-integration).
- Hosted checkout: [Widget Integration](https://api-docs.vortexfinance.co/widget-integration).

## Terms

By integrating with or using the Vortex API, SDK, or Widget, you agree to the Vortex [Terms and Conditions](https://www.vortexfinance.co/en/terms-and-conditions) and [Privacy Policy](https://www.vortexfinance.co/en/privacy-policy).

---
