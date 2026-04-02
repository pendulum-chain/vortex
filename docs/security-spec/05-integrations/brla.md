# BRLA Integration

## What This Does

BRLA is the Brazilian Real stablecoin anchor used for BRL on-ramp and off-ramp operations. It handles the fiat side of BRL transactions via PIX (Brazilian instant payment system).

**Provider type:** Both (on-ramp and off-ramp)  
**Fiat currency:** BRL (Brazilian Real)  
**Chains involved:** Moonbeam (BRLA token), Pendulum (wrapped BRLA via Nabla swap), Polygon  
**Phase handlers:**
- `brla-onramp-mint-handler.ts` — On-ramp: Teleports BRLA tokens to Moonbeam after PIX payment is confirmed
- `brla-payout-moonbeam-handler.ts` — Off-ramp: Triggers BRLA off-ramp (PIX payout) from Moonbeam/Polygon

**On-ramp flow:**
1. User receives PIX payment details (QR code) during ramp registration
2. User makes PIX payment to BRLA's account
3. BRLA confirms payment receipt
4. `brlaOnrampMint` phase: BRLA mints/teleports BRLA tokens to the ephemeral account on Moonbeam
5. Tokens continue through Nabla swap pipeline

**Off-ramp flow:**
1. Ramp processes through Pendulum swap → XCM to Moonbeam
2. `brlaPayoutOnMoonbeam` phase: Calls BRLA API `triggerOfframp` with user's tax ID (CPF), PIX key, receiver tax ID, and BRL amount
3. BRLA deducts its anchor fee and sends PIX payment to user

**Key detail:** BRLA requires a subaccount per user, identified by tax ID (CPF). The system creates/manages subaccounts as part of the ramp registration.

## Security Invariants

1. **BRLA API credentials MUST be stored as environment variables** — API key, secret, and any session tokens must come from env vars, never hardcoded.
2. **PIX amounts MUST match the quoted BRL amount** — The amount in the BRLA payout request must be derived from the ramp's stored quote, accounting for BRLA's anchor fee.
3. **User tax ID (CPF) MUST be validated** — CPF format validation before sending to BRLA. Malformed CPFs should be rejected at ramp registration, not at payout time.
4. **BRLA subaccount creation MUST be idempotent** — If a subaccount already exists for a tax ID, the system should not create a duplicate.
5. **BRLA anchor fee MUST be pre-accounted in the quoted amount** — The user's quoted BRL output has already deducted BRLA's fee. The payout amount sent to BRLA must be the gross amount (before BRLA's fee), so the user receives the net quoted amount.
6. **PIX payment confirmation MUST be verified before advancing** — On-ramp: The system must confirm that BRLA received the PIX payment before minting. Off-ramp: The system must confirm the payout was triggered successfully.
7. **BRLA API responses MUST be validated** — Status codes, transaction IDs, and amount confirmations must be checked. Unexpected responses should not advance the phase.
8. **BRLA interactions MUST be retryable** — Transient BRLA API failures should throw `RecoverablePhaseError`, allowing the phase processor to retry.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **PIX payment spoofing (on-ramp)** | Attacker claims PIX payment was made without actually paying | System relies on BRLA's payment confirmation, not user's claim; wait for BRLA to confirm receipt |
| **Tax ID fraud** | Attacker uses someone else's CPF to create a subaccount and receive off-ramp payouts | Tax ID validation is BRLA's responsibility at KYC level; Vortex should pass through validated data only |
| **Double payout (off-ramp)** | Bug causes `triggerOfframp` to be called twice for the same ramp | Phase processor's locking + phase history prevents double execution; BRLA should also have idempotency on their side |
| **BRLA API compromise** | Attacker intercepts or manipulates BRLA API calls | HTTPS enforcement; validate response amounts; monitor for discrepancies |
| **Amount manipulation between quote and payout** | Attacker modifies the payout amount between quote creation and execution | Payout amount derived from immutable quote stored in DB; not recalculated at execution time |
| **BRLA service outage** | BRLA API is unreachable during an active ramp | `RecoverablePhaseError` with retry; ramp waits in current phase until BRLA recovers |
| **Subaccount leak** | BRLA subaccount details (balances, transaction history) exposed via API | Minimize data stored about BRLA subaccounts; only store what's needed for ramp operation |

## Audit Checklist

- [x] BRLA API credentials loaded from environment variables (not hardcoded). **PASS** — verified: credentials loaded from env vars.
- [x] `brlaOnrampMint` handler verifies BRLA payment confirmation before minting/teleporting tokens. **PASS** — handler polls BRLA API for payment status before proceeding.
- [x] `brlaPayoutOnMoonbeam` handler passes the correct gross amount (accounting for BRLA's fee deduction). **PASS** — amount derived from ramp state quote values.
- [x] User CPF/tax ID is validated for format before being sent to BRLA. **PASS** — CPF validation present in registration flow.
- [x] BRLA subaccount creation is idempotent — no duplicate subaccounts for the same tax ID. **PASS** — checks existing subaccount before creating.
- [PARTIAL] BRLA API responses are validated (status code, amount confirmation, transaction ID). **PARTIAL** — shared package (`@packages/shared`) used for BRLA client; not fully audited as a separate module.
- [x] Both handlers use `RecoverablePhaseError` for transient BRLA API failures. **PASS** — verified in both handler files.
- [x] HTTPS is enforced for all BRLA API calls. **PASS** — base URL uses `https://`.
- [PARTIAL] No BRLA API credentials or user tax IDs appear in logs or error messages. **PARTIAL** — generic error logging may inadvertently include sensitive data in error objects; no explicit scrubbing.
- [FAIL] Timeout is configured for BRLA API calls. **FAIL F-014** — no explicit timeout configured on BRLA HTTP client; relies on default system/library timeouts.
- [x] PIX payment details (QR code) returned to user are generated server-side, not client-modifiable. **PASS** — PIX details come from BRLA API response.
- [PARTIAL] BRLA interaction amounts are logged for reconciliation (amounts, not credentials). **PARTIAL** — some logging exists but no formal reconciliation logging with explicit amount fields.
