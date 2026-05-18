# 3. Ramp Lifecycle

Every Vortex ramp follows the same high-level lifecycle.

## 1. Create A Quote

Use `POST /v1/quotes` when the route and network are known. Use `POST /v1/quotes/best` when Vortex should evaluate eligible routes and return the best available quote for the requested amount and currency pair.

A quote contains the input amount, expected output amount, source and destination, fee breakdown, payment method, selected network, and expiry. Quotes are short-lived and should be registered promptly.

## 2. Register The Ramp

Use `POST /v1/ramp/register` with the quote ID and public addresses of the ephemeral accounts created for this ramp. The response returns a `rampId`, current ramp state, and any unsigned transactions that must be signed before processing can continue.

Only public addresses are sent to Vortex. The matching ephemeral secret keys must stay with the SDK or API client.

## 3. Update The Ramp

Use `POST /v1/ramp/update` to submit signed transactions and route-specific transaction hashes. The SDK performs this automatically for supported flows. Direct API integrations must ensure that each signature or transaction hash matches the transaction returned by Vortex for the same ramp and phase.

## 4. Start The Ramp

Use `POST /v1/ramp/start` after required signatures, transaction hashes, and fiat payment steps are complete. For BRL buy flows, call start after the user completes the PIX payment.

## 5. Track Status

Use `GET /v1/ramp/{id}` to retrieve current state, or configure webhooks to receive lifecycle events asynchronously.

Production integrations should persist the `quoteId`, `rampId`, partner order ID, user/session identifier, and any local ephemeral-key backup reference needed for support or recovery.

---
