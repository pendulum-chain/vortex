# Alfredpay Integration

## What This Does

Alfredpay is a fiat payment provider supporting on-ramp and off-ramp operations across multiple currencies and countries. It is used for ramps where BRLA and Monerium do not cover the target market.

**Provider type:** Both (on-ramp and off-ramp)  
**Fiat currencies:** Multiple (varies by country, validated via `AlfredPayCountry` enum)  
**Chains involved:** Polygon (primary), EVM chains via SquidRouter  
**Phase handlers:**
- `alfredpay-onramp-mint-handler.ts` — On-ramp: Initiates Alfredpay on-ramp, receives tokens after fiat payment
- `alfredpay-offramp-transfer-handler.ts` — Off-ramp: Sends tokens to Alfredpay for fiat payout
- `squidRouter-permit-execution-handler.ts` — Off-ramp: Executes SquidRouter permit for the off-ramp swap

**On-ramp flow:**
1. User initiates on-ramp → receives fiat payment instructions from Alfredpay
2. User makes fiat payment
3. `alfredpayOnrampMint` phase: Alfredpay confirms payment and mints tokens on Polygon
4. `fundEphemeral` phase: Fund ephemeral with POL for gas
5. `squidRouterSwap` → `squidRouterPay` → `finalSettlementSubsidy` → `destinationTransfer` → `complete`

**Off-ramp flow:**
1. `squidRouterPermitExecute` phase: Execute SquidRouter permit (authorized swap + transfer)
2. `fundEphemeral` phase: Fund ephemeral with POL
3. `finalSettlementSubsidy` phase: Top up if needed
4. `alfredpayOfframpTransfer` phase: Transfer tokens to Alfredpay for fiat payout
5. `complete`

**Request validation:** Alfredpay middleware (`alfredpay.middleware.ts`) validates the `country` parameter against the `AlfredPayCountry` enum for all Alfredpay-related requests.

## Security Invariants

1. **Alfredpay API credentials MUST be stored as environment variables** — Never hardcoded or in database.
2. **Country validation MUST use the `AlfredPayCountry` enum** — The middleware validates that the country parameter is a valid enum value before processing.
3. **Amounts MUST match the quoted values** — On-ramp mint amounts and off-ramp payout amounts must derive from the stored quote.
4. **Off-ramp permit execution MUST verify the signed permit data** — The SquidRouter permit is a user-signed authorization. The execute handler must verify the permit is valid before executing.
5. **Final settlement subsidy MUST ensure the correct amount before Alfredpay transfer** — The subsidy step tops up to the exact amount needed; the transfer step sends that exact amount.
6. **Alfredpay API responses MUST be validated** — Status codes, transaction IDs, and amounts confirmed before phase advancement.
7. **Alfredpay interactions MUST be retryable** — Transient failures should use `RecoverablePhaseError`.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Invalid country injection** | Attacker sends unsupported country code to bypass validation | `validateResultCountry` middleware checks against `AlfredPayCountry` enum; rejects invalid values with 400 |
| **Fiat payment spoofing (on-ramp)** | User claims payment without paying | Wait for Alfredpay payment confirmation; no token minting without confirmation |
| **Permit replay (off-ramp)** | Attacker replays a previously-used SquidRouter permit | SquidRouter permits include nonces; the permit contract rejects replayed nonces |
| **Amount manipulation between subsidy and transfer** | Race condition modifies the balance between subsidy top-up and Alfredpay transfer | Both steps happen sequentially in the phase processor under a single ramp lock |
| **Alfredpay API compromise** | Attacker manipulates Alfredpay API responses | Validate response amounts against quote; HTTPS enforcement; monitor for discrepancies |
| **Multi-country regulatory complexity** | Different countries have different KYC/AML requirements | Country-specific validation at Alfredpay level; Vortex passes through validated user data |

## Audit Checklist

- [x] Alfredpay API credentials loaded from environment variables. **PASS** — verified: credentials from env vars.
- [x] `validateResultCountry` middleware applied to all Alfredpay-related endpoints. **PASS** — middleware applied in route definitions.
- [x] Country validation uses `Object.values(AlfredPayCountry).includes()` — not string matching. **PASS** — enum-based validation confirmed.
- [x] `alfredpayOnrampMint` handler verifies Alfredpay payment confirmation before minting. **PASS** — handler waits for Alfredpay confirmation.
- [x] `alfredpayOfframpTransfer` handler sends the correct amount (from stored quote, post-subsidy). **PASS** — amount derived from ramp state.
- [x] SquidRouter permit execution validates the permit data before executing. **PASS** — permit data validated via `isSignedTypedDataArray`.
- [x] All Alfredpay phase handlers use `RecoverablePhaseError` for transient failures. **PASS** — verified in all handlers.
- [x] HTTPS enforced for Alfredpay API calls. **PASS** — base URL uses `https://`.
- [x] No Alfredpay credentials or user payment details in logs. **PASS** — no credential leakage observed in log statements.
- [FAIL] Timeout configured for Alfredpay API calls. **FAIL F-014** — no explicit HTTP client timeout configured; relies on default system timeouts.
- [x] `finalSettlementSubsidy` runs before `alfredpayOfframpTransfer` in the off-ramp flow. **PASS** — phase ordering confirmed in flow definition.
