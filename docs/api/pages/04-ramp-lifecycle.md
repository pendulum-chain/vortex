# Ramp Lifecycle

Every Vortex ramp follows the same high-level lifecycle.

## 1. Create A Quote

Use `POST /v1/quotes` when the route and network are known. Use `POST /v1/quotes/best` when Vortex should evaluate eligible routes and return the best available quote for the requested amount and currency pair.

A quote contains the input amount, expected output amount, source and destination, fee breakdown, payment method, selected network, and expiry. Quotes are short-lived and should be registered promptly.

For attribution, send the public credential value as `X-Public-Key`. Anonymous quotes remain supported. If both public and secret headers are sent, they must identify the same API credential.

`POST /v1/quotes/best` is not called by the SDK today. Use the raw API directly when you want Vortex to select the best available route, then pass the returned quote into the SDK ramp flow.

## 2. Register The Ramp

Use `POST /v1/ramp/register` with the quote ID and public addresses of the ephemeral accounts created for this ramp. The response returns a `rampId`, current ramp state, and any unsigned transactions that must be signed before processing can continue.

Register, update, start, status, history, and diagnostic operations require `X-API-Key` secret capability or an accepted Supabase session. A public value cannot operate a ramp. The credential is bound to one profile, and provider/KYC ownership is derived from that profile rather than a request-selected user.

Only public addresses are sent to Vortex. The matching ephemeral secret keys must stay with the SDK or API client.

## 3. Update The Ramp

Use `POST /v1/ramp/update` to submit signed transactions and route-specific transaction hashes.

The SDK performs this automatically for supported flows. On buy flows, the SDK calls `POST /v1/ramp/update` inside `registerRamp` to submit presigned transactions. Direct API integrations must ensure that each signature or transaction hash matches the transaction returned by Vortex for the same ramp and phase.

On buys, the fiat payment instructions (`depositQrCode` for BRL, `ibanPaymentData` for EUR) are withheld until the presigned transactions pass validation: they are released on the update response and on `GET /v1/ramp/{id}`, not on the register response. SDK integrations receive them directly from `registerRamp`, which performs the update internally.

## 4. Start The Ramp

Use `POST /v1/ramp/start` after required signatures, transaction hashes, and fiat payment steps are complete. For BRL buys, call start after the user completes the PIX payment; for EUR buys, after the SEPA transfer. For USD, MXN, COP, and ARS buys the order is inverted: call start first — the start response's `achPaymentData` contains the bank transfer instructions the user must pay.

If a BRL PIX payment is confirmed by Avenia but the client cannot call start (for example because the managed profile was deleted or its corridor policy changed after registration), Vortex automatically starts the already-signed persisted ramp. This recovery is tied to the exact provider ticket issued at registration; it does not authorize new ramps or bypass payment verification.

## 5. Track Status

Use `GET /v1/ramp/{id}` to retrieve current state, or configure webhooks to receive lifecycle events asynchronously. `GET /v1/ramp/{id}/errors` returns the error log for a ramp and is useful for support tooling.

Before starting a flow, `sdk.getRampInfo()` / `GET /v1/ramp-info` can return the credential-bound profile's sanitized per-corridor `kycStatus`, `canBuy`, and `canSell` using a public or secret API key. Supabase sessions do not authorize this endpoint. It intentionally does not return exact limits, PII, provider IDs, or ramp history.

Production integrations should persist the `quoteId`, `rampId`, partner order ID, user/session identifier, and any local ephemeral-key backup reference needed for support or recovery.

---
