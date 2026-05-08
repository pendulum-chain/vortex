# BRLA / Avenia Integration

> **Updated 2026-05** — BRL flows migrated from Moonbeam/Pendulum to Base. The previous `brla-payout-moonbeam-handler.ts` and BRLA-on-Moonbeam ERC-20 path have been removed. This document reflects the current Base + Avenia API architecture. See `SPEC-DELTA-2026-05.md` for the change summary.

## What This Does

BRLA is the Brazilian Real stablecoin used for BRL on/off-ramp operations, accessed via the **Avenia API** (operator of BRLA). All BRL liquidity flow now happens on **Base (Ethereum L2)** — there is no longer any BRLA on Moonbeam/Polygon, no XCM/teleport for BRL, and no Pendulum-side BRL handling.

**Provider type:** Both (on-ramp and off-ramp)
**Fiat currency:** BRL (Brazilian Real)
**Chain involved:** Base (BRLA is an ERC-20 on Base)
**Phase handlers:**
- `brla-onramp-mint-handler.ts` — On-ramp: After PIX payment is confirmed by Avenia, BRLA tokens land on the Base ephemeral account; the handler polls the Base RPC until the expected balance arrives.
- `brla-payout-base-handler.ts` — Off-ramp: Sends a presigned ERC-20 transfer of BRLA from the Base ephemeral to the Avenia-controlled deposit address, then triggers an Avenia PIX payout via API.

### On-ramp flow (BRL → Base USDC → optional Squid → user destination)

1. User receives PIX deposit details (QR code) during ramp registration. The deposit QR code is gated behind successful presigned-tx validation (see `transaction-validation.md`).
2. User makes PIX payment to the Avenia-managed account.
3. `brlaOnrampMint`: Avenia mints BRLA on Base directly to the user's Base ephemeral. Handler polls `evmEphemeralAddress` balance every 5s for up to **30 minutes** (`PAYMENT_TIMEOUT_MS`) using `checkEvmBalancePeriodically` against a 5-minute inner balance-arrival timeout (`EVM_BALANCE_CHECK_TIMEOUT_MS`).
4. `subsidizePreSwapEvm` (if needed) → `nablaApproveEvm` → `nablaSwapEvm`: Nabla DEX **on Base** swaps BRLA → USDC.
5. `subsidizePostSwapEvm` (if needed) → `distributeFeesEvm` (Multicall3 batch on Base, see `fee-integrity.md`).
6. If destination is Base + USDC → direct `destinationTransfer` (Squid skipped — see `squid-router.md`). Otherwise → `squidRouterApprove` / `squidRouterSwap` → bridge to user's destination EVM chain → optional fallback `backupSquidRouter*` swap on the destination chain → `destinationTransfer`.

### Off-ramp flow (User EVM → Base USDC → BRLA → PIX)

1. User signs Squid permit / no-permit fallback / direct transfer (depending on source chain) → tokens arrive on Base ephemeral as USDC.
2. `distributeFeesEvm` runs **before** Nabla swap (commit `423a38c79`) so partner/vortex fees are taken in USDC.
3. `subsidizePreSwapEvm` → `nablaApproveEvm` → `nablaSwapEvm`: Nabla DEX on Base swaps USDC → BRLA.
4. `brlaPayoutOnBase`:
   1. Sends presigned ERC-20 transfer of `brlaTransferAmountRaw` (= `nablaSwapEvm.outputAmountRaw`) BRLA from the ephemeral to the Avenia deposit address (the Avenia subaccount's EVM wallet).
   2. Polls Avenia's `getAccountBalance(subAccountId)` until the BRLA balance is ≥ `nablaSwapEvm.outputAmountDecimal` (rounded to 2dp). 5s poll interval, 5-minute timeout.
   3. Calls `BrlaApiService.createPayOutQuote({ outputAmount: quote.outputAmount.round(2,0), subAccountId })` — the **PIX payout amount is `quote.outputAmount`**, not the deposited BRLA amount; the difference is the Avenia anchor fee.
   4. Calls `createPixOutputTicket` with the user's PIX key and the subaccount EVM wallet address.
   5. Polls ticket status until `PAID` or `FAILED` (5s interval, 5-minute timeout).

### Subaccount model

Avenia requires a subaccount per user, identified by tax ID (CPF). The system creates/manages subaccounts during ramp registration and maps them via the `TaxId` model (`taxIdRecord.subAccountId`).

### The three-amount model (off-ramp)

Three distinct BRL amounts are involved in `brlaPayoutOnBase`. They are **intentionally different**:

| Amount | Source | Purpose |
|---|---|---|
| `brlaTransferAmountRaw` | `quote.metadata.nablaSwapEvm.outputAmountRaw` | On-chain ERC-20 transfer to Avenia's deposit address. Sends the **full Nabla swap output**. |
| `amountForPayout` (balance check) | `quote.metadata.nablaSwapEvm.outputAmountDecimal` | Sanity check that Avenia received the full deposit before initiating PIX. |
| `amountForQuote` (Avenia PIX payout) | `quote.outputAmount.round(2,0)` | The **net BRL the user receives via PIX**. Equals deposit minus Avenia anchor fee. |

The invariant `transferAmount ≥ payoutAmount` must hold (transfer covers payout + anchor fee). If Nabla underdelivers, the balance-poll timeout fails the phase before any PIX is attempted.

## Security Invariants

1. **Avenia API credentials MUST be stored as environment variables** — API key, secret, and any session tokens come from env vars, never hardcoded.
2. **PIX payout amount MUST equal `quote.outputAmount`** — `createPayOutQuote.outputAmount` is derived from the immutable stored quote; the user receives exactly the quoted net BRL (after Avenia anchor fee).
3. **The on-chain BRLA transfer amount MUST equal `quote.metadata.nablaSwapEvm.outputAmountRaw`** — This guarantees the full Nabla output reaches Avenia; Avenia keeps the anchor fee and pays the user the net amount.
4. **`brlaPayoutOnBase` MUST NOT initiate the PIX payout until the Avenia balance reflects the deposit** — The balance poll prevents calling `createPixOutputTicket` against funds that have not yet been credited.
5. **User tax ID (CPF) MUST be validated** — CPF format validation at ramp registration, not at payout time.
6. **Avenia subaccount creation MUST be idempotent** — If a subaccount already exists for a tax ID, the system must not create a duplicate.
7. **PIX payment confirmation MUST be verified before advancing on-ramp** — `brlaOnrampMint` polls the Base ephemeral balance; advancement only on confirmed BRLA arrival.
8. **Avenia API responses MUST be validated** — Status codes, ticket IDs, and amount confirmations must be checked. `AveniaTicketStatus.FAILED` must throw an unrecoverable error; any other unexpected value must not advance the phase.
9. **Avenia interactions MUST be retryable** — Transient Avenia API failures throw `RecoverablePhaseError`; the phase processor retries.
10. **Recovery on resumed `brlaPayoutOnBase` MUST detect existing tickets** — If `payOutTicketId` is already in state, the handler skips re-issuing the PIX ticket and only polls status (prevents double-payout).
11. **Recovery on resumed on-chain transfer MUST detect existing tx hashes** — If `brlaPayoutTxHash` is in state, the handler waits for that receipt rather than re-broadcasting (prevents double on-chain BRLA transfer).
12. **PIX deposit details (QR code) MUST be generated server-side** — Returned via API response only after presigned transactions are validated, never client-modifiable.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **PIX payment spoofing (on-ramp)** | Attacker claims PIX payment was made without actually paying | System polls Base RPC for actual BRLA arrival; never trusts user claim. |
| **Tax ID fraud** | Attacker uses someone else's CPF to receive off-ramp payouts | Tax ID validation is Avenia's responsibility at KYC level; Vortex passes through validated data only. |
| **Double payout (off-ramp)** | Bug causes `createPixOutputTicket` to be called twice for the same ramp | (a) Phase processor's per-ramp lock prevents concurrent execution; (b) `payOutTicketId` recovery branch skips re-issue; (c) `brlaPayoutTxHash` recovery branch skips re-broadcast. |
| **Double on-chain transfer** | Crash between sending the BRLA transfer and storing the hash | Handler stores `brlaPayoutTxHash` only after the receipt. On retry, if no hash is stored, the same presigned tx is re-broadcast — EVM nonce uniqueness prevents double-spend. |
| **Avenia API compromise** | Attacker intercepts or manipulates Avenia API calls | HTTPS enforced; balance verified on-chain against deposit; PIX amount derived from immutable quote. |
| **Amount manipulation between quote and payout** | Attacker modifies the payout amount between quote and execution | `quote.outputAmount` read from DB at execution time; quote is immutable post-creation. |
| **Avenia service outage** | Avenia API is unreachable mid-ramp | `RecoverablePhaseError` → phase processor retries; off-ramp fails to payout but BRLA is held on the Avenia subaccount, not lost. |
| **Subaccount data leak** | Avenia subaccount details exposed via API | Only `subAccountId`, EVM wallet address, and balances are stored locally; no PII beyond CPF (which is itself a regulatory requirement). |
| **Underdelivery from Nabla** | Nabla swap returns less BRLA than quoted, balance poll times out, ramp stuck | Balance-poll timeout (5min) fails the phase as recoverable; `subsidizePostSwapEvm` is supposed to top up shortfalls — but see `fund-routing.md` for the missing EVM USD cap. |

## Audit Checklist

- [x] Avenia API credentials loaded from environment variables (not hardcoded). **PASS** — credentials loaded via env config.
- [x] `brlaOnrampMint` polls Base RPC for BRLA arrival before advancing. **PASS** — `checkEvmBalancePeriodically` against `evmEphemeralAddress` for up to 30 minutes.
- [x] `brlaPayoutOnBase` PIX amount equals `quote.outputAmount`. **PASS** — `createPayOutQuote.outputAmount = amountForQuote = new Big(quote.outputAmount).round(2,0)`.
- [x] On-chain BRLA transfer amount equals `nablaSwapEvm.outputAmountRaw`. **PASS** — `brlaTransferAmountRaw = quote.metadata.nablaSwapEvm.outputAmountRaw` in `evm-to-brl-base.ts:136`.
- [x] User CPF/tax ID is validated at ramp registration (not at payout). **PASS** — CPF validation present in registration flow.
- [x] Avenia subaccount creation is idempotent. **PASS** — checks existing subaccount before creating.
- [x] Recovery: `payOutTicketId` short-circuits ticket re-creation. **PASS** — `brla-payout-base-handler.ts:57-60`.
- [x] Recovery: `brlaPayoutTxHash` short-circuits on-chain transfer re-broadcast. **PASS** — `brla-payout-base-handler.ts:157-189`.
- [PARTIAL] Avenia API responses are validated (status, amount, ticket ID). **PARTIAL** — ticket status checked for `PAID`/`FAILED`; other statuses fall through to retry; no explicit amount cross-check on `getAccountBalance` response shape.
- [x] `RecoverablePhaseError` used for transient Avenia API failures. **PASS** — `createRecoverableError` wraps `sendBrlaPayoutTransaction` failures and ticket-status timeouts.
- [x] HTTPS enforced for all Avenia API calls. **PASS** — base URL uses `https://`.
- [PARTIAL] No Avenia API credentials or user tax IDs appear in logs. **PARTIAL** — `payOutTicketId` is debug-logged with the literal CPF subaccount; review log redaction.
- [FAIL] **F-014 (CARRIED OVER)**: Timeout configured for Avenia HTTP client. **FAIL** — relies on default system/library timeouts; no explicit `AbortController` on `BrlaApiService` calls.
- [x] PIX deposit details (QR code) generated server-side. **PASS** — comes from Avenia API response.
- [x] PIX deposit details released to user only after presign validation. **PASS** — gated by `ephemeralPresignChecksPass` (see `transaction-validation.md`, commit `32be1659c`).
- [PARTIAL] Avenia interactions logged for reconciliation (amounts, not credentials). **PARTIAL** — info logs include amounts; no formal reconciliation log with structured fields.
- [x] **FINDING F-064 (MEDIUM)**: BRLA KYC callback endpoint requires authentication. **PASS (FIXED)** — `/kyc/record-attempt` uses `requireAuth`.

## Open Questions (see SPEC-DELTA-2026-05.md)

- **F-NEW-01 (HIGH)**: `validateBRLOfframp` in `offramp/common/validation.ts` has hardcoded `offrampAmountBeforeAnchorFeesRaw: "200"` with a TODO; never validated against `quote.outputAmount`. **Confirmed bug; must fix.**
- **F-NEW-02 (MEDIUM)**: `subsidize-pre/post-swap-evm-handler.ts` lack the USD cap that `final-settlement-subsidy.ts` enforces. **Confirmed gap; EVM subsidies are unbounded.**
