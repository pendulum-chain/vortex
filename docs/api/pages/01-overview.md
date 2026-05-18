# 1. Overview

Vortex is a cross-chain ramping platform for moving between fiat currencies and crypto assets. It supports buy and sell flows across payment rails such as PIX and blockchain networks such as Base, Polygon, Pendulum, Stellar, Moonbeam, AssetHub, and Hydration.

These docs are intended for partner developers integrating Vortex into an application, backend, wallet, checkout flow, or operations dashboard. The endpoint reference documents the raw API surface, while the guide pages explain the recommended integration sequence and the responsibilities that sit on the API client side.

For most integrations, Vortex recommends using `@vortexfi/sdk` instead of calling the ramp endpoints directly. The SDK wraps the quote and ramp lifecycle, creates fresh ephemeral accounts, signs required transactions, submits ramp updates, and can store local backups of ephemeral secrets. Direct API integrations are possible, but they must implement those responsibilities themselves.

The current SDK release is intended for trusted Node.js environments. Browser support is not enabled. SEPA paths are present in parts of the API surface, but the current SDK flow is centered on BRL/PIX support.

Vortex does not custody user private keys. During a ramp, temporary blockchain accounts called ephemeral accounts may hold funds in transit. Their public addresses are sent to Vortex, but their secret keys stay with the SDK or API client. This design keeps the signing boundary outside the Vortex API, but it also means the client must store the ephemeral secrets securely until the ramp has completed and any recovery window has passed.

## Recommended Integration Paths

Use the SDK when your application can run a trusted Node.js environment and wants Vortex to handle transaction signing and ramp update mechanics.

Use the Widget when you want a hosted checkout experience and do not want to build the full user-facing ramp flow yourself.

Use the raw API directly only when you need custom orchestration and are prepared to handle ephemeral key custody, signing, backups, ramp updates, and recovery flows yourself.

---
