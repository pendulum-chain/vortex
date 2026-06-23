# Alfredpay Integration

## What This Does

Alfredpay is a fiat payment provider supporting on-ramp and off-ramp operations across multiple currencies and countries. It is used for ramps where BRLA and Mykobo do not cover the target market (e.g. ARS, MXN, COP, USD via ACH).

**Provider type:** Both (on-ramp and off-ramp)
**Fiat currencies:** Multiple (varies by country, validated via `AlfredPayCountry` enum)
**Chains involved:** Polygon (Alfredpay-side, USDT / `ALFREDPAY_EVM_TOKEN`), EVM destinations via SquidRouter (Polygon → Base/other)
**Customer types:** Individual (KYC) and Business (KYB) — selected via `AlfredpayCustomerType`. The controller maps Alfredpay's KYB status to the platform's `AlfredPayStatus` via `mapKybStatus`; KYC is handled by `mapKycStatus`. Branch in `alfredpay.controller.ts` on `AlfredpayCustomerType.BUSINESS`.

**Phase handlers:**
- `alfredpay-onramp-mint-handler.ts` — On-ramp: waits for Alfredpay payment confirmation and credits the Alfredpay on-chain token (`ALFREDPAY_EVM_TOKEN`) to the ephemeral on Polygon.
- `alfredpay-offramp-transfer-handler.ts` — Off-ramp: transfers the Alfredpay on-chain token to Alfredpay's settlement address for fiat payout. Recovers from expired upstream quotes by re-quoting at execute time (see [Quote Lifecycle — AlfredPay Provider Quote TTL](../03-ramp-engine/quote-lifecycle.md)).
- `subsidize-pre-swap-handler.ts` — Subsidy: tops up the ephemeral's Alfredpay on-chain token balance on Polygon to the discount-engine's `targetOutputAmountRaw` before the next stage. Uses `getEvmSubsidyConfig` to pick the Alfredpay-specific funding account and token (`ALFREDPAY_EVM_TOKEN`).
- `squid-router-phase-handler.ts` — Cross-chain bridge for non-Polygon EVM destinations. Same-chain same-token routes short-circuit via `isSameChainSameTokenPassthrough` (no SquidRouter call when source and destination are both Polygon `ALFREDPAY_EVM_TOKEN`).

**On-ramp flow:**
1. Quote stage emits `ctx.alfredpayOnramp` with provider `quoteId` (30s upstream TTL) and `ctx.subsidy` with the discount-engine target.
2. API-key-authenticated integration initiates on-ramp for a user with completed Alfredpay KYC → receives Alfredpay payment instructions.
3. User makes fiat payment.
4. `alfredpayOnrampMint` phase: confirms Alfredpay payment, credits the Alfredpay on-chain token to the ephemeral on Polygon. If the provider quote is degraded or expired and the discount engine's `expectedOutput` exceeds the provider's, the phase emits `alfredOnrampMintFallback` to record the substitution.
5. `subsidizePreSwap` phase: tops up the ephemeral's Alfredpay on-chain token balance to the subsidy target (Polygon, `ALFREDPAY_EVM_TOKEN`).
6. `squidRouterSwap` phase: routes the Polygon Alfredpay token to the destination EVM chain/token. For same-chain same-token (Polygon `ALFREDPAY_EVM_TOKEN` → Polygon `ALFREDPAY_EVM_TOKEN`), the passthrough shortcut sends the funds directly without invoking SquidRouter.
7. `destinationTransfer` → `polygonCleanup` → `complete`.

For routed Alfredpay onramps (any non-passthrough output), the final quote output is the Squid destination-token amount. `quote.outputAmount` MUST be stored with the destination token's decimals, and `evmToEvm.outputAmountRaw` MUST preserve Squid's destination-token raw output. The Polygon-minted Alfredpay token remains the Squid source amount; the spec must not treat Polygon source-token decimals as final settlement precision.

**Off-ramp flow:**
1. Quote stage emits `ctx.alfredpayOfframp` with provider `quoteId` and the AlfredPay fiat order is created during `prepareOfframpEvmToAlfredpay...` (see `transactions/offramp/routes/evm-to-alfredpay.ts:229`). At prep time, if the quote carries `metadata.alfredpayOfframp`, the service calls `refreshAlfredpayOfframpQuoteIfMatching` to swap in a fresh provider `quoteId` (strict: `toAmount` and `fee` must be identical; drift throws an `INTERNAL_SERVER_ERROR`). The order is authoritative from prep time; `processAlfredpayOfframpStart` only re-validates state before phase execution.
2. `squidRouterPermitExecute` or `squidRouterNoPermitTransfer/Approve/Swap` phase: executes the user-signed permit (or the no-permit equivalent) and lands the Alfredpay on-chain token on Polygon.
3. `finalSettlementSubsidy` phase: always runs for Alfredpay offramps — the direct-transfer skip in `FinalSettlementSubsidyHandler` explicitly excludes `SELL && isAlfredpayToken(outputCurrency)` so the subsidy top-up is never bypassed.
4. `alfredpayOfframpTransfer` phase: transfers the Alfredpay on-chain token to Alfredpay's settlement address for fiat payout. If Alfredpay rejects the stored `quoteId` as expired, the handler requests a fresh provider quote at execute time and re-attempts (`alfredpayOfframpTransferFallback` phase records the re-attempt).
5. `polygonCleanupAxlUsdc` → `complete`.

**Request validation:** Alfredpay middleware (`alfredpay.middleware.ts`) validates the `country` parameter against the `AlfredPayCountry` enum for all Alfredpay-related requests.

## Security Invariants

1. **Alfredpay API credentials MUST be stored as environment variables** — Never hardcoded or in database.
2. **Country validation MUST use the `AlfredPayCountry` enum** — The middleware validates that the country parameter is a valid enum value before processing.
3. **Amounts MUST match the quoted values, or be bounded by the discount engine's `expectedOutput`** — On-ramp mint amounts must derive from the stored quote; if the upstream provider quote degrades, the `alfredOnrampMintFallback` path MUST use the discount engine's `expectedOutput` and the subsidy MUST remain bounded by `maxSubsidy × expectedOutput`.
4. **Off-ramp permit execution MUST verify the signed permit data** — The SquidRouter permit is a user-signed authorization; the execute handler MUST verify the permit is valid before executing.
5. **Subsidy MUST run before the Alfredpay-bound transfer** — `subsidizePreSwap` (onramp) and the Squid-side stages plus `alfredpayOfframpTransfer` (offramp) MUST be ordered so the ephemeral holds the exact subsidized amount before the final transfer step.
6. **Alfredpay API responses MUST be validated** — Status codes, transaction IDs, and amounts confirmed before phase advancement.
7. **Alfredpay interactions MUST be retryable** — Transient failures should use `RecoverablePhaseError`.
8. **Provider quote refresh MUST be strict** — `refreshAlfredpayOnrampQuoteIfMatching` re-binds the provider `quoteId` only when the new provider response is byte-identical on `toAmount` and `fee`. Any drift forces the route into the bounded fallback path.
9. **Off-ramp expired-quote recovery MUST re-create the AlfredPay order, not the Vortex quote** — `alfredpay-offramp-transfer-handler.ts` re-quotes against the provider and re-issues `createOfframp` against the same Vortex quote; it MUST NOT mutate the Vortex `QuoteTicket`.
10. **KYB and KYC status mapping MUST be branched by `AlfredpayCustomerType`** — Business customers use `mapKybStatus`; individuals use `mapKycStatus`. Treating one as the other would allow incomplete due-diligence states to pass as `Success`.
11. **Polygon passthrough MUST preserve amount integrity** — The same-chain same-token shortcut in `squid-router-phase-handler.ts` MUST round down (`toFixed(0, 0)`) and MUST use `evmToEvm.inputAmountRaw` as the source-of-truth amount (matching the subsidy target).
12. **The Polygon swap short-circuit MUST be gated on the output token, not on the destination network alone** — Alfredpay mints `ALFREDPAY_EVM_TOKEN` (USDT) directly on Polygon, so the `squidRouterSwap` handler short-circuits straight to `finalSettlementSubsidy` (no swap) only when `quote.metadata.request.to === Networks.Polygon` **and** `quote.outputCurrency === ALFREDPAY_EVM_TOKEN`. `quote.metadata.request.to` is the destination *network*, not the output token; gating on the network alone would mis-deliver — a user requesting any other Polygon output (e.g. USDC) would silently receive the minted USDT instead of their swapped asset. The quote engine (`onramp-polygon-to-evm-alfredpay.ts`) mirrors this: it emits `skipRouteCalculation: true` only for the same-token (`outputCurrency === ALFREDPAY_EVM_TOKEN`) case and otherwise produces a real USDT→output swap.
13. **Offramp quote refresh at prep time MUST be strict and transactional** — `refreshAlfredpayOfframpQuoteIfMatching` (called during `prepareOfframpNonBrlTransactions`) re-fetches a provider quote and compares `toAmount` and `fee`. Any drift throws `INTERNAL_SERVER_ERROR`, aborting ramp registration. The quote metadata update (new `quoteId` + `expirationDate`) runs within the registration transaction, so a partial update cannot persist.
14. **`finalSettlementSubsidy` MUST NOT be skipped for Alfredpay offramps** — The `FinalSettlementSubsidyHandler` direct-transfer skip explicitly excludes `SELL && isAlfredpayToken(outputCurrency)`. This ensures the ephemeral on Polygon is always topped up to the expected amount before `alfredpayOfframpTransfer`, preventing under-funded settlements.
15. **Routed Alfredpay onramp quote output precision MUST match the destination token** — For Alfredpay USD/MXN/COP/ARS onramps that route through Squid, `quote.outputAmount` MUST preserve the final destination token's decimal precision, and `evmToEvm.outputAmountRaw` MUST represent the destination token's raw units. The Polygon-minted Alfredpay token is only the Squid source-side input. Direct Polygon same-token passthrough remains at the minted token's 6-decimal precision.
16. **Alfredpay ramp registration MUST bind to a completed KYC/KYB customer** — Registration MUST reject Alfredpay onramps before customer lookup when no completed Alfredpay customer context is available, and MUST reject customer records whose Alfredpay status is not `Success`. This prevents ramps from reaching provider/customer queries with undefined `user_id` and ensures payment instructions are only issued for verified Alfredpay customers. SDK/server integrations authenticate with partner API keys (`pk_*`/`sk_*`); Supabase Bearer tokens are frontend/user-session auth.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Invalid country injection** | Attacker sends unsupported country code to bypass validation | `validateResultCountry` middleware checks against `AlfredPayCountry` enum; rejects invalid values with 400 |
| **Fiat payment spoofing (on-ramp)** | User claims payment without paying | Wait for Alfredpay payment confirmation; no token crediting without confirmation |
| **Permit replay (off-ramp)** | Attacker replays a previously-used SquidRouter permit | SquidRouter permits include nonces; the permit contract rejects replayed nonces |
| **Amount manipulation between subsidy and transfer** | Race condition modifies the balance between subsidy top-up and Alfredpay transfer | Both steps happen sequentially in the phase processor under a single ramp lock |
| **Alfredpay API compromise** | Attacker manipulates Alfredpay API responses | Validate response amounts against quote; HTTPS enforcement; monitor for discrepancies |
| **Multi-country regulatory complexity** | Different countries have different KYC/AML requirements | Country-specific validation at Alfredpay level; KYB vs KYC mapping branched by `AlfredpayCustomerType` |
| **Provider quote-quote-fall fallback abuse** | Attacker times provider quote drift between Vortex quote and ramp start to maximise the discount-engine fallback subsidy | Provider quote TTL is ~30s; `refreshAlfredpayOnrampQuoteIfMatching` only re-binds on byte-identical `toAmount`/`fee`; otherwise the fallback path is bounded by `maxSubsidy × expectedOutput` and only fires when `targetDiscount > 0` |
| **Expired provider quote on offramp transfer** | Provider rejects the stored `quoteId` at transfer time, blocking settlement | `alfredpay-offramp-transfer-handler.ts` re-quotes at execute time and emits `alfredpayOfframpTransferFallback`; the Vortex `QuoteTicket` is untouched |
| **Offramp quote drift at prep time** | Market moves between quote creation and ramp registration; the refreshed Alfredpay offramp quote has different `toAmount`/`fee` | `refreshAlfredpayOfframpQuoteIfMatching` compares `toAmount` and `fee` exactly; any drift throws `INTERNAL_SERVER_ERROR`, aborting registration. The user must re-quote. |
| **Alfredpay offramp skipping subsidy via direct-transfer flag** | An Alfredpay offramp ramp with `isDirectTransfer === true` skips `finalSettlementSubsidy`, under-funding the settlement | `FinalSettlementSubsidyHandler` explicitly excludes `SELL && isAlfredpayToken(outputCurrency)` from the direct-transfer skip; subsidy always runs for Alfredpay offramps |
| **Polygon passthrough rounding** | Same-chain same-token shortcut rounds the bridge output incorrectly, leaking dust or under-funding the destination | `toFixed(0, 0)` round-down in the squid-router finalize; downstream subsidy ensures the destination receives the quoted amount |
| **Polygon wrong-token delivery** | A user on-ramps via Alfredpay and requests a non-USDT Polygon output (e.g. USDC); the handler skips the swap on destination-network alone and transfers the minted USDT, delivering the wrong asset | The `squidRouterSwap` short-circuit is gated on `quote.outputCurrency === ALFREDPAY_EVM_TOKEN` (not just `quote.metadata.request.to === Networks.Polygon`); non-USDT Polygon outputs run the real USDT→output swap. Matched in the quote engine's `skipRouteCalculation` branch. |
| **Routed destination precision loss** | A USD/MXN/COP/ARS Alfredpay onramp mints a 6-decimal Polygon source token, routes to an 18-decimal destination token, and stores the final quote output with source precision. The final amount is truncated before destination-transfer expectations are calculated. | Finalize routed Alfredpay EVM quotes with the destination token's decimals when `evmToEvm` metadata exists; keep direct Polygon same-token passthrough at minted-token precision. |
| **Anonymous Alfredpay registration** | An SDK caller registers an Alfredpay onramp without a completed KYC customer context, causing undefined `user_id` customer lookups or issuing instructions without KYC context | Alfredpay onramp registration fails with a public auth/KYC error unless a `Success` Alfredpay customer record is available. SDK/server callers authenticate with partner API keys. |

## Audit Checklist

- [x] Alfredpay API credentials loaded from environment variables. **PASS** — verified: credentials from env vars.
- [x] `validateResultCountry` middleware applied to all Alfredpay-related endpoints. **PASS** — middleware applied in route definitions.
- [x] Country validation uses `Object.values(AlfredPayCountry).includes()` — not string matching. **PASS** — enum-based validation confirmed.
- [x] `alfredpayOnrampMint` handler verifies Alfredpay payment confirmation before crediting. **PASS** — handler waits for Alfredpay confirmation.
- [x] `alfredpayOfframpTransfer` handler sends the correct amount (from stored quote, post-subsidy) and recovers expired provider quotes via re-quote + `createOfframp`. **PASS** — `alfredpay-offramp-transfer-handler.ts:127-136`.
- [x] SquidRouter permit execution validates the permit data before executing. **PASS** — permit data validated via `isSignedTypedDataArray`.
- [x] All Alfredpay phase handlers use `RecoverablePhaseError` for transient failures. **PASS** — verified in all handlers.
- [x] HTTPS enforced for Alfredpay API calls. **PASS** — base URL uses `https://`.
- [x] No Alfredpay credentials or user payment details in logs. **PASS** — no credential leakage observed in log statements.
- [FAIL] Timeout configured for Alfredpay API calls. **FAIL F-014** — no explicit HTTP client timeout configured; relies on default system timeouts.
- [x] `subsidizePreSwap` runs before `squidRouterSwap` on the onramp flow and before `alfredpayOfframpTransfer` on the offramp flow. **PASS** — phase ordering confirmed in `fund-ephemeral-handler.ts` transition and offramp route definition.
- [x] Onramp fallback emits `alfredOnrampMintFallback` when the discount engine's `expectedOutput` supersedes the provider's `finalOutput`. **PASS** — `transactions/onramp/routes/alfredpay-to-evm.ts:269`. Phase is registered as an EVM phase in `transactions/validation.ts:249`.
- [x] Offramp fallback emits `alfredpayOfframpTransferFallback` for expired-quote recovery; phase is registered as an EVM phase in `transactions/validation.ts:250`. **PASS**.
- [x] KYB vs KYC status mapping is branched by `AlfredpayCustomerType.BUSINESS` in `alfredpay.controller.ts`. **PASS** — `mapKybStatus` for business, `mapKycStatus` for individual.
- [x] Polygon same-chain same-token passthrough uses `isSameChainSameTokenPassthrough` shortcut, rounds down (`toFixed(0, 0)`), and uses `evmToEvm.inputAmountRaw` as the source amount. **PASS** — `squid-router-phase-handler.ts` + `squidrouter/index.ts` finalize.
- [x] Alfredpay Polygon onramp swap short-circuit is gated on `quote.outputCurrency === ALFREDPAY_EVM_TOKEN`, not on `quote.metadata.request.to === Networks.Polygon` alone. **PASS** — `squid-router-phase-handler.ts` checks both; `onramp-polygon-to-evm-alfredpay.ts` only sets `skipRouteCalculation` for the same-token case. Prevents a non-USDT Polygon output (e.g. USDC) from being delivered as the minted USDT.
- [x] `refreshAlfredpayOnrampQuoteIfMatching` only re-binds the provider `quoteId` when `toAmount` and `fee` match byte-identically. **PASS** — `ramp.service.ts:1480-1491`.
- [x] `refreshAlfredpayOfframpQuoteIfMatching` re-fetches a fresh provider quote at prep time, compares `toAmount` and `fee` exactly, and throws on drift. Quote metadata update (new `quoteId` + `expirationDate`) runs within the registration transaction. **PASS** — `ramp.service.ts`.
- [x] `FinalSettlementSubsidyHandler` does NOT skip subsidy for Alfredpay offramps (`SELL && isAlfredpayToken`). **PASS** — explicit exclusion in the direct-transfer skip condition.
- [x] AlfredPay offramp order is created at prep time (`evm-to-alfredpay.ts:229`); `processAlfredpayOfframpStart` is a defensive validation-only no-op. **PASS** — verified.
- [x] Routed Alfredpay onramp quote output precision follows destination token decimals when `evmToEvm` metadata exists; direct Polygon same-token passthrough remains at minted-token precision. **PASS** — verified in `finalize/onramp.ts`.
- [x] Alfredpay onramp registration rejects missing customer context before customer lookup and requires a `Success` Alfredpay customer status. **PASS** — `ramp.service.ts` checks for the current user-backed customer context; `alfredpay-to-evm.ts` rejects missing/non-success customer records.
