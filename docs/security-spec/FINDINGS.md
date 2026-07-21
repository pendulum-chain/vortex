# Audit Findings Tracker

> **Generated:** 2026-04-02 | **Last Updated:** 2026-05-22 | **Status:** F-001 through F-067: 49 fixed, 9 accepted risk, 9 deferred, 0 open. F-068 through F-071 raised by the Mykobo integration audit: 4 open. F-072 raised by the ephemeral-account lifecycle review: 1 fixed. Additional discount-mechanism findings F-DISC-01 through F-DISC-05 remain open in `03-ramp-engine/discount-mechanism.md` and are not included in the counts below.

This file consolidates all security findings from the Vortex platform audit. Findings were discovered across six phases: specification writing (F-001 through F-012), code-vs-spec audit across all 8 modules (F-013 through F-037), transaction validation / ephemeral account / phase flow audit (F-038 through F-058), fresh security audit pass (F-059 through F-067), Mykobo integration audit (F-068 through F-071), and ephemeral-account lifecycle review (F-072).

## Summary

| Severity | Fixed | Accepted | Deferred | Open | Total |
|---|---|---|---|---|---|
| 🔴 Critical | 5 | 0 | 0 | 1 | 6 |
| 🟠 High | 11 | 3 | 3 | 1 | 18 |
| 🟡 Medium | 25 | 3 | 6 | 1 | 35 |
| 🔵 Low / ⚪ Info | 8 | 3 | 0 | 1 | 12 |
| **Total** | **49** | **9** | **9** | **4** | **71** |

> **Fixed** = code change implemented and verified. **Accepted** = CTO reviewed and accepted risk, no code change. **Deferred** = requires architectural work, separate app changes, or future investigation. **Open** = newly identified, awaiting fix or CTO decision.

---

## 🔴 Critical

### F-001: Final Settlement Subsidy USD Cap Not Enforced

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/phases/handlers/final-settlement-subsidy.ts`, lines 211-213 |
| **Spec** | `06-cross-chain/fund-routing.md` |
| **Status** | ✅ **FIXED** |
| **Impact** | A single ramp could drain the funding account's entire native token balance via an unbounded SquidRouter swap. |

**Description:** `this.createUnrecoverableError(...)` is called **without the `throw` keyword**. The error object is created but never thrown, so execution continues past the cap check. The `MAX_FINAL_SETTLEMENT_SUBSIDY_USD` constant provides zero protection.

**Fix:** Add `throw` before `this.createUnrecoverableError(...)`.

---

### F-002: Dual Fee System Discrepancy

| Field | Value |
|---|---|
| **Location** | Token-config-based fees (used for deductions) vs. database-stored fees (displayed only) |
| **Spec** | `03-ramp-engine/fee-integrity.md` |
| **Status** | ✅ **FIXED** |
| **Impact** | Fees shown to the user may not match fees actually deducted. Silent divergence over time. |

**Description:** Two parallel fee calculation paths exist. Token-config-based fees are what actually deduct from user amounts during swaps. Database-based fees are calculated, stored, and displayed — but are NOT used for actual deductions. These two systems can produce different numbers for the same ramp, meaning users may see one fee but pay another.

**CTO Clarification (2026-04-02):** Unify into a single source of truth. One fee calculation path used for both display and deduction.

**Resolution:** Removed the redundant `fee` column from `QuoteTicket`. This column stored `displayFiat` fees separately from `metadata.fees`, but was never read back by any code path — `buildQuoteResponse()` and `feeDistribution.ts` both read from `metadata.fees`. The column was dead weight creating the illusion of a second source of truth. `assignFeeSummary()` is now documented as the single source of truth for all fee representations. Migration `025-remove-quote-ticket-fee-column` drops the column while preserving historical data in `metadata.fees`.

---

### F-013: Multiple Security-Sensitive Endpoints Have No Authentication

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/routes/v1/ramp.route.ts`, `pendulum.route.ts`, `subsidize.route.ts`, `moonbeam.route.ts`, `stellar.route.ts`, `webhook.route.ts`, `brla.route.ts`, `maintenance.route.ts` |
| **Spec** | `00-system-overview/architecture.md`, `01-auth/api-keys.md`, `01-auth/supabase-otp.md` |
| **Status** | ✅ **FIXED** (legacy endpoints removed; strict dual-track auth enforced on all remaining sensitive routes) |
| **Found** | Code audit, iteration 2 |
| **Impact** | Attacker can start ramps, trigger XCM execution, fund ephemeral accounts, and initiate subsidization — all spending platform funds — without any authentication. |

**Description:** The following endpoints originally had **zero authentication middleware**:

- `POST /v1/ramp/start` — starts ramp phase processing
- `POST /v1/ramp/update` — updates ramp with presigned transactions
- `GET /v1/ramp/:id` — reads full ramp state (including internal details)
- `POST /v1/pendulum/fundEphemeral` — triggers funding from platform wallet
- `POST /v1/subsidize/preswap`, `POST /v1/subsidize/postswap` — triggers subsidization
- `POST /v1/moonbeam/execute-xcm` — triggers cross-chain message execution
- `POST /v1/stellar/create` — requests Stellar transaction signatures
- `POST /v1/webhook/`, `DELETE /v1/webhook/:id` — register/delete webhooks
- `PATCH /v1/maintenance/schedules/:id/active` — toggle maintenance mode
- `GET /v1/brla/getUser`, `GET /v1/brla/getUserRemainingLimit`, etc. — user data without auth

**Resolution:**

1. **Legacy endpoints removed:** `/pendulum/fundEphemeral`, `/moonbeam/execute-xcm`, `/subsidize/preswap`, `/subsidize/postswap` were deleted; the server now drives ramp progression internally.
2. **Strict dual-track auth on all `/v1/ramp/*` endpoints** (`/register`, `/update`, `/start`, `/:id`, `/:id/errors`, `/history`, `/history/:walletAddress`) and on `POST /v1/ramp/quotes` and `POST /v1/ramp/quotes/best`. The `requirePartnerOrUserAuth()` middleware (`apps/api/src/api/middlewares/dualAuth.ts`) accepts **either**:
   - `X-API-Key: sk_*` — partner API key (used by the SDK), or
   - `Authorization: Bearer <jwt>` — Supabase access token (used by the first-party frontend).

   Anonymous access is rejected with HTTP 401. The previous backwards-compat carve-out (allowing `/ramp/start` and `/ramp/update` to remain unauthenticated until SDK consumers migrated) has been removed.

3. **Ownership enforcement:** every authenticated principal can only access its own resources.
   - **Partner principal:** ownership is the chain `RampState.quoteId → QuoteTicket.partnerId === authenticatedPartner.id`. `getRampHistory` joins through `QuoteTicket` to filter by `partnerId`.
   - **Supabase user principal:** ownership is `RampState.userId === req.userId` (and the analogous check on `QuoteTicket.userId` for `/ramp/register`). Account-wide `GET /v1/ramp/history` requires this effective user identity and never falls back to partner-wide access.
   - Cross-principal access is rejected with HTTP 403.

4. **Other routes:** `requireAuth` was added to `/stellar/create` and the `/brla/*` user data endpoints; `adminAuth` was added to `/maintenance/*`; `apiKeyAuth` was added to `/webhook` POST/DELETE.
5. **Quotes:** `enforcePartnerAuth()` is now active on `POST /v1/ramp/quotes` and `POST /v1/ramp/quotes/best`. Passing a `partnerId` without a matching secret API key is rejected (closes a partner-spoofing vector).

The API remains directly internet-exposed; defence-in-depth (rate limits, request validators, ownership guards) is the protection model.

---

### F-038: EVM Typed Data Bypasses ALL Validation

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/transactions/validation.ts`, lines 105-107 |
| **Spec** | `03-ramp-engine/transaction-validation.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Transaction validation audit, 2026-04-07 |
| **Impact** | A malicious API client can submit EIP-712 typed data authorizing a transfer to an attacker's address. The server will execute it without any validation. |

**Description:** When presigned transactions use `SignedTypedData` or `SignedTypedDataArray` format (EIP-712 permits used by `squidRouterPermitExecute` and similar flows), `validatePresignedTxs()` returns immediately without performing ANY validation:

```typescript
if (isSignedTypedData(txData) || isSignedTypedDataArray(txData)) {
  return; // ALL EVM validation skipped
}
```

This means no signer check, no chainId check, no `from` address check, and no content validation for EIP-712 typed data. A malicious client could submit a permit that authorizes an attacker's spender address for unlimited token allowance, or typed data that routes a SquidRouter execution to an attacker-controlled contract.

**Fix:** Decode EIP-712 typed data and validate critical fields: `spender` must match the expected contract (SquidRouter, TokenRelayer), `value` must match expected amounts, `deadline` must be reasonable, and `verifyingContract` must match the expected chain's deployed contract address.

---

### F-039: Stellar Payment Amount, Destination, and Asset Not Validated

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/transactions/validation.ts`, lines 287-301 |
| **Spec** | `03-ramp-engine/transaction-validation.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Transaction validation audit, 2026-04-07 |
| **Impact** | A malicious client can redirect Stellar payments to an attacker's address, send incorrect amounts, or send the wrong asset — all while passing server-side validation. |

**Description:** The `stellarPayment` validation in `validateStellarTransaction()` checks that: (1) the operation type is "payment", and (2) the transaction source matches the expected signer. However, it does NOT validate:

- **Payment amount** — not checked against the quote's expected amount
- **Payment destination** — not checked against the expected anchor deposit address; could redirect to an attacker's Stellar address
- **Payment asset** — not checked; could send a worthless token instead of the expected stablecoin

A malicious client could sign a Stellar payment for 0.0001 XLM to their own address (instead of the quoted amount of USDC to the Stellar anchor) and the server would accept and execute it.

**Fix:** Validate the Stellar payment operation's `destination`, `amount`, and `asset` (code + issuer) against the quote's expected values. These values are known at ramp registration time and should be passed through to the validator.

---

## 🟠 High

### F-003: Phase Processor Lock is Non-Atomic

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/phases/phase-processor.ts` |
| **Spec** | `03-ramp-engine/state-machine.md` |
| **Status** | 🟠 **DEFERRED** — requires DB-level locking implementation |
| **Impact** | Two API instances could process the same ramp simultaneously, causing double-execution of phase handlers (double swaps, double XCM transfers). |

**Description:** Lock acquisition reads `state.processingLock.locked` from a potentially stale DB read, then sets it in a separate UPDATE. No `SELECT FOR UPDATE`, advisory lock, or atomic compare-and-swap. The in-memory `Set` only protects within a single Node.js process.

**CTO Clarification (2026-04-02):** Currently single instance, but multi-instance deployment is planned for the future. Should add proper DB-level locking now in preparation.

**Fix:** Use `SELECT FOR UPDATE` or database advisory locks for cross-instance safety. Implement now even though it's currently single-instance, to prepare for future multi-instance deployment.

---

### F-004: Infinite Soft Loop After Max Retries

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/phases/phase-processor.ts` |
| **Spec** | `03-ramp-engine/state-machine.md` |
| **Status** | ✅ **FIXED** |
| **Impact** | Ramps that exhaust their retry budget stay in the current phase indefinitely. On each processing cycle, they are retried again — consuming resources and potentially repeating side effects. |

**Description:** After `MAX_RETRIES` (8) is exhausted for a recoverable error, the ramp stays in its current phase. It is not transitioned to `failed`. The next processing cycle picks it up again and the retry counter restarts.

**CTO Clarification (2026-04-02):** After max retries, transition the ramp to `failed` state. User gets notified, manual intervention possible.

**Fix:** Transition to `failed` after max retries exhausted. The retry counter should not reset across processing cycles.

---

### F-005: No Secrets Manager / No Rotation Mechanism

| Field | Value |
|---|---|
| **Location** | All services — `apps/api/src/config/vars.ts`, `apps/rebalancer/src/utils/config.ts` |
| **Spec** | `07-operations/secret-management.md` |
| **Status** | ⚪ **ACCEPTED** — Render.com built-in secrets management is sufficient |
| **Impact** | Server compromise exposes every funding key, database credential, and third-party API key. No way to rotate without full redeployment. No access logging for secret usage. |

**Description:** All secrets are plain environment variables loaded at startup. No HSM, no secrets manager (AWS Secrets Manager, Vault, etc.), no encrypted storage at rest, no audit trail. Blast radius of a server compromise is total: Stellar funding keys, Pendulum seeds, Moonbeam executor keys, all rebalancer chain keys, database credentials, admin tokens, and all third-party API keys.

**CTO Clarification (2026-04-02):** Planned improvement. Migration to a secrets manager is on the roadmap but not in this audit cycle's scope.

**Resolution (2026-04-07):** After evaluating Render.com's built-in secrets management (encrypted at rest, SOC 2 Type II, admin-only access in protected environments, audit logging), an external secrets manager (AWS SM, Vault) was deemed unnecessary for the current risk profile. The highest-value secrets (blockchain signing keys) cannot be auto-rotated by any secrets manager anyway. The centralized `config/vars.ts` refactoring (F-016) already provides a clean migration path if requirements change. Revisit if: multi-team ACL needed, regulatory mandate for CMK, or multi-instance deployment requires per-secret policies.

---

### F-006: Rebalancer State File — No Locking

| Field | Value |
|---|---|
| **Location** | `apps/rebalancer/src/services/stateManager.ts` |
| **Spec** | `07-operations/rebalancer.md` |
| **Status** | 🟠 **DEFERRED** — requires locking mechanism, separate app |
| **Impact** | Concurrent rebalancer executions could corrupt state and cause double-execution of swaps/XCMs. |

**Description:** Rebalancer state is stored as a JSON file in Supabase Storage. Supabase Storage has no file locking, no conditional writes, no atomic compare-and-swap. If two instances run simultaneously, both read the same state and could execute the same steps.

**CTO Clarification (2026-04-02):** Concurrent rebalancer runs can happen (e.g., cron overlap). Needs a locking mechanism.

**Fix:** Add a locking mechanism (e.g., DB-based lock, advisory lock, or Supabase row-level lock) to prevent concurrent rebalancer execution. Check and acquire lock at startup, release on completion or crash.

---

### F-014: Most External HTTP Calls Lack Timeout Configuration

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/monerium/index.ts`, `priceFeed.service.ts`, `moonpay/moonpay.service.ts`, `transak/transak.service.ts`, `alchemypay/alchemypay.service.ts`, `ramp/helpers.ts`, `distribute-fees-handler.ts`, `slack.service.ts` |
| **Spec** | `00-system-overview/architecture.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Code audit, iteration 2 |
| **Impact** | A hanging external service can block the caller indefinitely. For phase handlers, this stalls ramp processing. For price feeds, this stalls quote generation. |

**Description:** Of 16+ `fetch()` calls to external services, only `webhook-delivery.service.ts` uses `AbortController` with a timeout. All others (Mykobo, BRLA, CoinGecko, Moonpay, Transak, AlchemyPay, Subscan, Slack, ramp helpers) make HTTP requests without any timeout or `AbortSignal`. The historical Monerium `fetch` calls had the same gap and have been carried forward into the Mykobo client.

**Fix:** Add `AbortController` with appropriate timeouts (e.g., 10-30s) to all external `fetch()` calls. Consider a shared utility function like `fetchWithTimeout(url, options, timeoutMs)`.

---

### F-029: Executor and Funding Key Reuse — No Blast Radius Separation

| Field | Value |
|---|---|
| **Location** | `apps/api/src/constants/constants.ts`, line 45: `const MOONBEAM_FUNDING_PRIVATE_KEY = MOONBEAM_EXECUTOR_PRIVATE_KEY;` |
| **Spec** | `06-cross-chain/fund-routing.md`, Invariant 3; `07-operations/secret-management.md` |
| **Status** | ⚪ **ACCEPTED** — known gap, single EOA by design for now |
| **Found** | Code audit, iteration 2, Module 06 |
| **Impact** | Compromise of any single function (executor, funding, Monerium, SquidRouter) compromises ALL functions. No blast radius containment. |

**Description:** `MOONBEAM_FUNDING_PRIVATE_KEY` is directly aliased to `MOONBEAM_EXECUTOR_PRIVATE_KEY` in `constants.ts`. This single key is used across at least 6 different handler files for 4 distinct security roles:
1. **Executor** — calling `executeXCM` on the Moonbeam receiver contract (`moonbeam-to-pendulum-handler.ts`)
2. **EVM Funding** — subsidizing ephemeral accounts on Moonbeam, Polygon, and destination EVM chains (`fund-ephemeral-handler.ts`, `final-settlement-subsidy.ts`)
3. **Monerium** — signing self-transfer transactions (`monerium-onramp-self-transfer-handler.ts`)
4. **SquidRouter** — executing permit operations (`squidrouter-permit-execution-handler.ts`)

Each of these roles has different exposure surfaces and trust requirements. A single key compromise (e.g., from a SquidRouter API integration leak) would grant an attacker the ability to drain the funding account, execute arbitrary XCM transfers, and sign Monerium operations.

**CTO Clarification (2026-04-02):** Known gap, to be addressed later. Currently only one EOA is managed on Moonbeam. Key separation requires deploying and funding additional accounts.

**Fix:** Deferred. Document as accepted risk with a plan to separate keys when infra supports multiple funded EOAs. When addressed: one key for executor (XCM contract calls), one for EVM funding (subsidization), one for third-party integrations (Monerium, SquidRouter).

---

### F-033: Rebalancer Steps Not Idempotent — Double-Spend on Crash Recovery

| Field | Value |
|---|---|
| **Location** | `apps/rebalancer/src/rebalance/brla-to-axlusdc/index.ts` (orchestrator); `apps/rebalancer/src/rebalance/brla-to-axlusdc/steps.ts` (step implementations) |
| **Spec** | `07-operations/rebalancer.md`, Invariant 3 |
| **Status** | 🟠 **DEFERRED** — requires rebalancer app changes |
| **Found** | Code audit, iteration 2, Module 07 |
| **Impact** | A crash between step execution and `saveState()` causes the step to re-execute on next run, leading to double swaps, double XCM transfers, or duplicate BRLA withdrawal tickets — all resulting in direct fund loss. |

**Description:** The rebalancer is an 8-step state machine that persists progress to Supabase Storage (JSON file). Each step runs, then `saveState()` records completion. Steps 2, 3, 5, 6, and 7 are NOT idempotent:

- **Step 2** (`transferBrlaToPendulum`): Creates a BRLA withdrawal ticket. Crash → duplicate ticket → double withdrawal.
- **Step 3** (`swapBrlaForUsdc`): Executes a Nabla DEX swap. Crash → swap executed but state not saved → re-swap on restart → double token consumption.
- **Step 5** (`transferUsdcToMoonbeamWithSquidrouter`): Executes a SquidRouter cross-chain swap. Crash → same issue → double swap.
- **Step 6** (`transferGlmrToMoonbeam`): XCM transfer. Crash → double XCM → double deduction from source chain.
- **Step 7** (`transferBrlaToMoonbeam`): XCM transfer. Same double-execution risk.

None of these steps check for prior execution evidence (e.g., transaction hash from previous attempt, nonce guards, or balance pre-checks) before re-executing.

**CTO Clarification (2026-04-02):** Crash recovery is a real concern. Steps should be made idempotent.

**Fix:** Make each step idempotent. Recommended approach:
1. **Transaction hash guards**: Save the tx hash in state immediately after submission (before `saveState()` for the full step). On re-entry, check if the tx hash exists and verify its status before re-executing.
2. **Nonce guards**: Use explicit nonce management so re-submitted transactions are rejected as duplicates.
3. **Balance pre-checks**: Before executing a transfer, check if the expected balance change already occurred (e.g., tokens already on target chain).
4. **Atomic state + execution**: Write state before execution with an "in-progress" marker, then update to "completed" after.

---

### F-037: Multiple Sensitive POST Endpoints Lack Authentication and Input Validation

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/routes/v1/ramp.route.ts` (`/ramp/update`, `/ramp/start`); `apps/api/src/api/routes/v1/pendulum.route.ts` (`/pendulum/fundEphemeral`); `apps/api/src/api/routes/v1/moonbeam.route.ts` (`/moonbeam/execute-xcm`); `apps/api/src/api/routes/v1/maintenance.route.ts` (`/maintenance/schedules/:id/active`); `apps/api/src/api/routes/v1/webhook.route.ts` (POST, DELETE) |
| **Spec** | `07-operations/api-surface.md`, Invariants 4 & 8 |
| **Status** | ✅ **FIXED** (legacy endpoints removed, auth added per CTO decisions) |
| **Found** | Code audit, iteration 2, Module 07 |
| **Impact** | Unauthenticated attackers can: (1) manipulate ramp state machine transitions, (2) trigger platform fund transfers to arbitrary ephemeral accounts, (3) execute arbitrary XCM transfers, (4) toggle maintenance mode on/off, (5) register/delete webhooks. Combined with F-001, an attacker could drain funding accounts. |

**Description:** A systematic review of all 27 route files in `apps/api/src/api/routes/v1/` reveals that several sensitive endpoints have no authentication middleware and insufficient input validation:

1. **`/ramp/update` (POST)** — No auth, no validation middleware. Accepts any body. Triggers ramp state machine processing via `rampController.update()`. An attacker could advance or manipulate any ramp's state.
2. **`/ramp/start` (POST)** — No auth, no validation middleware. Triggers `rampController.start()` which initiates ramp execution. Combined with knowledge of a ramp ID, an attacker could start processing.
3. **`/pendulum/fundEphemeral` (POST)** — No auth, no validation middleware. Triggers `pendulumController.fundEphemeral()` which transfers platform funds to an ephemeral account. An attacker could trigger funding of arbitrary addresses.
4. **`/moonbeam/execute-xcm` (POST)** — No auth. Only validates field existence (not types or ranges). Executes cross-chain XCM transfers via `moonbeamController.executeXcm()`.
5. **`/maintenance/schedules/:id/active` (PATCH)** — No auth. Toggles maintenance mode for schedules. An attacker could disable maintenance windows or enable them to cause service disruption.
6. **`/webhook` (POST, DELETE)** — No auth for webhook registration or deletion. Anyone can register callback URLs or delete existing webhooks.

**CTO Clarification (2026-04-02):**
- Legacy endpoints (`/pendulum/fundEphemeral`, `/moonbeam/execute-xcm`, `/subsidize/*`) — **remove entirely** (see F-013 clarification).
- `/ramp/start`, `/ramp/update` — **unauthenticated for now** (backwards compat). Auth planned as future iteration.
- `/stellar/create` — **add requireAuth or apiKeyAuth**.
- `/maintenance/schedules/:id/active` — **add adminAuth**.
- `/webhook` POST/DELETE — **add apiKeyAuth** (partner-facing).
- `/brla/*` user data — **add requireAuth**.
- API is **directly exposed to the internet** with no network-level restrictions.

**Fix:**
1. **Remove** legacy endpoints: `/pendulum/fundEphemeral`, `/moonbeam/execute-xcm`, `/subsidize/preswap`, `/subsidize/postswap`
2. **Add auth**: `adminAuth` on `/maintenance/*`, `apiKeyAuth` on `/webhook` POST/DELETE, `requireAuth` on `/stellar/create` and `/brla/*` user data
3. **Add input validation middleware** for all remaining endpoints
4. **Document** `/ramp/start` and `/ramp/update` as intentionally unauthenticated (temporary) with TODO for API key auth

---

### F-040: Stellar CreateAccount Validation Incomplete — StartingBalance, Cosigner, and Asset Not Checked

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/transactions/validation.ts`, lines 236-285 |
| **Spec** | `03-ramp-engine/transaction-validation.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Transaction validation audit, 2026-04-07 |
| **Impact** | A malicious client can manipulate the Stellar account setup to: omit the server cosigner (making cleanup impossible and enabling fund theft), set a minimal startingBalance (causing downstream failures), or add trust for the wrong asset. |

**Description:** The `stellarCreateAccount` path in `validateStellarTransaction()` validates that the correct operation types are present (createAccount, setOptions, changeTrust) and that the transaction source matches the expected signer. However, it does NOT validate:

- **`startingBalance`** in the createAccount operation — client could set it to the minimum (1 XLM) instead of the required amount
- **`SetOptions` cosigner** — client could omit the server's cosigner public key, then drain the funded account unilaterally since the server would have no signing authority
- **`ChangeTrust` asset** — client could add a trustline for a worthless asset instead of the expected stablecoin

The cosigner omission is the most dangerous: without the server cosigner, cleanup transactions cannot be authorized, and the client retains full unilateral control of the ephemeral account after it's been funded by the platform.

**Fix:** Validate: (1) `startingBalance` meets the minimum required for the ramp, (2) `SetOptions` includes the server's cosigner public key with appropriate weight, (3) `ChangeTrust` asset code and issuer match the expected token for this ramp.

---

### F-041: SELL Direction Bypasses SquidRouter Validation Entirely

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/transactions/validation.ts`, line 94 |
| **Spec** | `03-ramp-engine/transaction-validation.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Transaction validation audit, 2026-04-07 |
| **Impact** | Off-ramp (SELL) SquidRouter swap and approve transactions are not validated at all. A malicious client could submit a SquidRouter swap that routes funds to an attacker's EVM address. |

**Description:** For SELL-direction ramps, the validation loop explicitly skips SquidRouter transactions:

```typescript
if (direction === RampDirection.SELL && (tx.phase === "squidRouterSwap" || tx.phase === "squidRouterApprove")) continue;
```

This means the client's presigned SquidRouter swap and approval transactions are accepted without any content validation. The client could submit a swap routing output to a different recipient, or an approval granting allowance to an attacker contract.

**Fix:** Remove the SELL-direction skip. Validate SquidRouter transactions for all directions, checking at minimum: the swap recipient address, the approval spender address, and the token/amount being swapped.

---

### F-042: Substrate Transaction Content Never Validated — Only Signer Checked

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/transactions/validation.ts`, lines 153-205 |
| **Spec** | `03-ramp-engine/transaction-validation.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Transaction validation audit, 2026-04-07 |
| **Impact** | A malicious client could submit any Substrate extrinsic (e.g., `balances.transferAll` to an attacker address) in place of the expected swap, XCM, or bridge call. The server would execute it as long as the signer matches. |

**Description:** `validateSubstrateTransaction()` only validates that the extrinsic signer matches the expected signer address. It does NOT decode or inspect the extrinsic content: method name, pallet, call parameters, amounts, and destination addresses are all unchecked.

Substrate extrinsics encode the call data (pallet + method + parameters) in the payload. Without decoding and validating this, the server has no assurance that the signed extrinsic performs the intended action (e.g., a Nabla swap, an XCM transfer, a Spacewalk redeem).

**Fix:** Decode each Substrate extrinsic using the chain's metadata and validate: (1) the pallet and method match the expected call for this phase, (2) key parameters (amounts, destination addresses) match expected values from the quote, (3) reject extrinsics with unexpected call data.

---

### F-044: No Cleanup for Failed or Timed-Out Ramps — Funds Stuck on Ephemeral Accounts

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/workers/cleanup.worker.ts`, line 154 |
| **Spec** | `03-ramp-engine/ephemeral-accounts.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Ephemeral account audit, 2026-04-07 |
| **Impact** | Tokens funded to ephemeral accounts during failed ramps are permanently stuck. Platform funds used for subsidization are unrecoverable. |

**Description:** The cleanup worker's query filter only processes ramps with `currentPhase: "complete"`:

```typescript
currentPhase: "complete"
```

Ramps that fail mid-execution (e.g., after `fundEphemeral` or `subsidizePreSwap` but before the swap completes) remain in a `failed` state. Their ephemeral accounts may hold:
- Native tokens from `fundEphemeral` (platform funds)
- Subsidized tokens from `subsidizePreSwap` / `subsidizePostSwap` (platform funds)
- Swapped tokens that were never bridged or delivered

These tokens sit indefinitely on ephemeral accounts with no recovery mechanism. Over time, this constitutes a slow drain of platform funds.

**Fix:** Extend the cleanup worker to also query for ramps with `currentPhase: "failed"` (and optionally ramps that have been stuck in a non-terminal phase for longer than a configurable timeout, e.g., 24 hours). Add logic to detect which phases completed and which chains have residual balances, then invoke the appropriate post-process handlers.

---

### F-045: No Cleanup Handler for Polygon, Hydration, or AssetHub Chains

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/phases/post-process/index.ts` |
| **Spec** | `03-ramp-engine/ephemeral-accounts.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Ephemeral account audit, 2026-04-07 |
| **Impact** | Residual tokens on Polygon, Hydration, and AssetHub ephemeral accounts are never recovered. For Polygon (Monerium EURe) and Hydration (swap outputs), these can be significant amounts. |

**Description:** Post-process handlers exist for three chains: Stellar (`StellarPostProcessHandler`), Pendulum (`PendulumPostProcessHandler`), and Moonbeam (`MoonbeamPostProcessHandler`). Three chains that ephemeral accounts may hold tokens on have NO cleanup handler:

- **Polygon** — Monerium EURe on-ramp mints tokens to the Polygon ephemeral account. After the ramp completes, any dust or failed-transfer tokens remain.
- **Hydration** — Hydration swap operations may leave residual tokens on the Hydration ephemeral account.
- **AssetHub** — XCM transfers through AssetHub may leave residual tokens if the transfer fails partway.

**Fix:** Implemented post-process handlers for all three chains: (1) **Polygon** — presigned `approve(fundingAddress, maxUint256)` created at registration time; handler broadcasts the approve, checks ERC-20 balance via `balanceOf`, and calls `transferFrom` using the server's `MOONBEAM_FUNDING_PRIVATE_KEY`. (2) **Hydration** — presigned `utility.batchAll([tokens.transferAll, balances.transferAll])` created at registration time; handler decodes and submits via `submitExtrinsic` (same pattern as Pendulum). (3) **AssetHub** — explicit no-op (no ephemeral on AssetHub). Route builders updated: `monerium-to-evm.ts`, `alfredpay-to-evm.ts`, `monerium-to-assethub.ts`, `avenia-to-assethub.ts`. Validation updated with `polygonCleanup` → EVM, `hydrationCleanup` → Substrate.

---

### F-048: Stellar Payment Allows Extra Operations — No Operation Count Check

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/transactions/validation.ts`, lines 287-301 |
| **Spec** | `03-ramp-engine/transaction-validation.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Transaction validation audit (checklist walkthrough), 2026-04-07 |
| **Impact** | A malicious client can inject additional operations into the Stellar payment transaction that execute alongside the legitimate payment. |

**Description:** The `stellarCreateAccount` validation enforces `transaction.operations.length !== 3` to ensure exactly 3 operations. However, the `stellarPayment` validation only checks `operations[0].type === "payment"` and `transaction.source === signer` — it does NOT check the operation count. A malicious client could craft a Stellar transaction with:

- Operation 0: legitimate payment (passes validation)
- Operation 1: a second payment to an attacker's Stellar address
- Operation 2: an account merge sending the remaining XLM balance to the attacker

All additional operations would execute atomically with the legitimate payment since they're in the same Stellar transaction envelope.

**Fix:** Add `transaction.operations.length === 1` check for `stellarPayment` transactions, matching the pattern used for `stellarCreateAccount`.

---

### F-053: Multiple Phase Handlers Lack Idempotency Guards — Double-Execution on Retry

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/phases/handlers/stellar-payment-handler.ts`, `pendulum-to-assethub-phase-handler.ts`, `pendulum-to-hydration-xcm-phase-handler.ts`, `hydration-swap-handler.ts`, `nabla-swap-handler.ts` |
| **Spec** | `03-ramp-engine/ramp-phase-flows.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Phase flow audit (checklist walkthrough), 2026-04-07 |
| **Impact** | If the phase processor retries these handlers (due to 10-minute timeout or recoverable error), they will re-execute the on-chain transaction, causing double swaps, double XCM transfers, or double Stellar payments — all resulting in direct fund loss. |

**Description:** Five phase handlers that submit on-chain transactions have NO explicit idempotency guard (no nonce check, no tx hash guard, no balance pre-check):

1. **`stellar-payment-handler.ts`** — Submits the presigned Stellar payment XDR directly. No check for prior submission. Double submission sends the payment amount twice.
2. **`pendulum-to-assethub-phase-handler.ts`** — Submits presigned XCM extrinsic. Stores `pendulumToAssethubXcmHash` after submission but never checks it before submitting. If the phase times out after submission but before the hash is stored, retry causes double XCM.
3. **`pendulum-to-hydration-xcm-phase-handler.ts`** — Same pattern as above. Stores `pendulumToHydrationXcmHash` but doesn't check it before submission.
4. **`hydration-swap-handler.ts`** — Submits presigned Hydration DEX swap extrinsic. No hash guard, no nonce check. Double swap consumes tokens twice.
5. **`nabla-swap-handler.ts`** — Submits presigned Nabla DEX swap extrinsic. No hash guard. Double swap means the second swap operates on an empty balance (likely failing, but consuming gas and causing a failed ramp).

By contrast, handlers like `spacewalk-redeem-handler` (nonce guard), `moonbeam-to-pendulum-handler` (hash guard), and `squid-router-phase-handler` (hash/nonce guard) demonstrate the correct pattern.

**Fix:** Add idempotency guards to each handler:
1. **Hash guard pattern**: Before submitting, check if the tx hash already exists in state. If yes, skip to the waiting/verification path. Store the hash immediately after submission (before waiting for finalization).
2. **Nonce guard pattern**: Compare the ephemeral account's current nonce against the expected nonce. If the nonce has advanced, the transaction was already included — skip to verification.
3. For `stellar-payment-handler`, check the Stellar ephemeral account's sequence number or verify the payment operation on Horizon before re-submitting.

---

### F-054: Backup Presigned Transactions Have No Registered Phase Handlers — Dead Code or Missing Implementation

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/transactions/onramp/routes/monerium-to-evm.ts`, `alfredpay-to-evm.ts`, `avenia-to-evm.ts`; `apps/api/src/api/services/phases/register-handlers.ts` |
| **Spec** | `03-ramp-engine/ramp-phase-flows.md` |
| **Status** | 🟠 **ACCEPTED** |
| **Found** | Transaction validation audit (agent investigation), 2026-04-07 |
| **Impact** | Three onramp routes build presigned transactions for phases `backupSquidRouterApprove`, `backupSquidRouterSwap`, and `backupApprove`, but NO phase handler is registered for any of these phases. If the ramp state machine ever transitions to these phases, the phase registry will have no handler to execute them — the ramp will be stuck indefinitely. If these phases are never reached, the user is signing transactions (including an unlimited ERC-20 approval) that serve no purpose and waste user interaction time. |

**CTO Decision (2026-04-10):** Accepted — backup transactions are intentionally kept for manual execution when SquidRouter swaps fail. No automated handler needed.

**Description:** All three onramp-to-EVM routes (`monerium-to-evm.ts`, `alfredpay-to-evm.ts`, `avenia-to-evm.ts`) build three "backup" presigned transactions per ramp:

1. `backupSquidRouterApprove` — ERC-20 approval for the SquidRouter contract
2. `backupSquidRouterSwap` — SquidRouter swap call
3. `backupApprove` — **Unlimited** (`maxUint256`) ERC-20 approval to the platform's funding account

These are pushed to `unsignedTxs` and the client signs them. However, `register-handlers.ts` only registers 27 handlers, and **none** of them have `getPhaseName()` returning `backupSquidRouterApprove`, `backupSquidRouterSwap`, or `backupApprove`. The `phaseRegistry.getHandler(phase)` call in the phase processor will return `undefined` for these phases.

The backup nonce is set to `0` (or `polygonAccountNonce` for Polygon), meaning these transactions could theoretically be submitted by anyone with access to the raw signed tx data if the ephemeral account's nonce matches.

**Fix:** Either:
- **Option A:** Implement dedicated backup handlers (or a generic backup execution handler) and register them in `register-handlers.ts`, with clear transition logic for when the primary path fails.
- **Option B:** If the backup mechanism is not yet implemented, remove the backup presigned transaction building from all three routes to avoid: (1) unnecessary user signatures, (2) a dangling unlimited approval signed by the user, (3) confusion about whether these phases can be reached.

---

---

## 🟡 Medium

### F-007: 50MB Body Parser Limit

| Field | Value |
|---|---|
| **Location** | `apps/api/src/config/express.ts` |
| **Spec** | `07-operations/api-surface.md` |
| **Status** | ✅ **FIXED** |
| **Impact** | Memory exhaustion via large request bodies. At 100 req/min rate limit, an attacker can push ~5GB/min of memory pressure per IP. |

**Description:** `bodyParser.json({ limit: "50mb" })` is configured. Typical JSON APIs use 1-10MB. A 50MB limit combined with the global rate limit (100 req/min) allows significant memory pressure.

**CTO Clarification (2026-04-02):** No endpoint needs more than ~1MB. The largest payload is the presigned transaction bundle from the user, which is well under 1MB. 50MB was not intentional.

**Fix:** Reduce to `1mb` (or at most `10mb` as a safety margin). No per-route override needed.

---

### F-008: Staging CORS Origin in Production

| Field | Value |
|---|---|
| **Location** | `apps/api/src/config/express.ts` |
| **Spec** | `07-operations/api-surface.md` |
| **Status** | ✅ **FIXED** |
| **Impact** | If the staging site is compromised or has XSS, it becomes a CORS-allowed origin for the production API. |

**Description:** `staging--pendulum-pay.netlify.app` is in the CORS whitelist alongside production domains. This means the staging site can make authenticated cross-origin requests to production.

**CTO Clarification (2026-04-02):** Oversight. The staging origin should NOT be in the production CORS whitelist.

**Fix:** Remove staging origins from production CORS config. Gate behind `NODE_ENV` check.

---

### F-009: Hydration XCM Skips Finalization

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/phases/handlers/hydration-to-assethub-xcm-phase-handler.ts` |
| **Spec** | `06-cross-chain/xcm-transfers.md` |
| **Status** | 🟡 **DEFERRED** — requires investigation into Hydration finalization |
| **Impact** | A Hydration chain reorganization could revert the XCM transfer after the ramp has already transitioned to `complete`. |

**Description:** `submitExtrinsic` is called with `waitForFinalization=false` because "it somehow doesn't work on Hydration." The handler proceeds after inclusion. If the chain reorganizes, the transfer is reverted but the ramp is already marked complete.

**CTO Clarification (2026-04-02):** Investigate and fix. The root cause of finalization not working on Hydration should be identified and resolved rather than accepted.

**Fix:** Investigate why `waitForFinalization=true` doesn't work on Hydration. Fix the root cause so the handler waits for finalization before proceeding. If the fix is non-trivial, add post-hoc verification (check finalization status before marking ramp complete).

---

### F-010: `safeCompare` Leaks Admin Secret Length

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/middlewares/adminAuth.ts` |
| **Spec** | `01-auth/admin-auth.md` |
| **Status** | ✅ **FIXED** |
| **Impact** | Timing side-channel reveals the length of `ADMIN_SECRET`. Attacker can determine secret length before attempting brute force. |

**Description:** `safeCompare()` returns early on `a.length !== b.length`. While the character-by-character comparison is constant-time, the length check is not. An attacker can probe with different-length tokens to determine the exact length of the admin secret.

**Fix:** Pad or hash both inputs to equal length before comparison. Or use `crypto.timingSafeEqual` with equal-length buffers.

---

### F-011: Ephemeral Webhook RSA Keys

| Field | Value |
|---|---|
| **Location** | `apps/api/src/config/crypto.ts` |
| **Spec** | `02-signing-keys/server-side-signing.md` |
| **Status** | ✅ **FIXED** |
| **Impact** | Webhook signatures change on every restart. Consumers lose ability to verify signatures from the previous instance. |

**Description:** If `WEBHOOK_PRIVATE_KEY` is not set, `CryptoService` generates an ephemeral RSA keypair at startup. This key is non-persistent: webhook signatures generated before a restart cannot be verified after, and vice versa.

**CTO Clarification (2026-04-02):** `WEBHOOK_PRIVATE_KEY` IS set in production. The ephemeral fallback is only for local development.

**Fix:** Add a startup validation check: if `NODE_ENV === "production"` and `WEBHOOK_PRIVATE_KEY` is not set, terminate the process with a clear error. This prevents accidental deployment without the key.

---

### F-012: Dynamic Pricing State In-Memory Only

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/quote/engines/discount/helpers.ts` |
| **Spec** | `03-ramp-engine/quote-lifecycle.md` |
| **Status** | ⚪ **ACCEPTED** — no code change needed |
| **Impact** | Server restart resets all partner discount states. Partners lose accumulated rate adjustments, causing abrupt rate changes. |

**Description:** The `partnerDiscountState` Map is in-memory only. All dynamic pricing state (the `difference` value per partner) is lost on restart.

**CTO Clarification (2026-04-02):** Acceptable. Losing dynamic pricing state on restart is fine — partners adapt quickly. No persistence needed.

---

### F-015: Internal Error Messages Leaked in API Responses

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/middlewares/error.ts`, `apps/api/src/api/middlewares/auth.ts` |
| **Spec** | `00-system-overview/architecture.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Code audit, iteration 2 |
| **Impact** | Internal error messages may reveal implementation details to attackers (library names, internal paths, database errors). |

**Description:** While stack traces are correctly stripped in production, the `err.message` from arbitrary internal errors is passed through to API responses via the `converter` middleware. Additionally, `auth.ts:58` includes `details: err.message` in the response. Internal error messages can contain database connection errors, file paths, or other sensitive information.

**Fix:** In production, replace internal error messages with generic messages (e.g., "Internal server error") unless the error is a known user-facing `APIError`. Only pass through messages from errors explicitly created for user consumption.

---

### F-016: Funding Seed Accessed Directly via `process.env`

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/pendulum/pendulum.service.ts:9` |
| **Spec** | `00-system-overview/architecture.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Code audit, iteration 2 |
| **Impact** | High-value signing key bypasses centralized config, making future secret rotation and access auditing harder. |

**Description:** `const { PENDULUM_FUNDING_SEED } = process.env;` accesses the funding seed directly instead of through `config/vars.ts`. Other services (`slack.service.ts`, `priceFeed.service.ts`) also access `process.env` directly for API keys.

**Fix:** Move all `process.env` access to `config/vars.ts`. Access all secrets through the centralized config object.

---

### F-022: SEP-10 Master Secret Aliased to Stellar Funding Secret

| Field | Value |
|---|---|
| **Location** | `apps/api/src/constants/constants.ts:43` (`SEP10_MASTER_SECRET = FUNDING_SECRET`) |
| **Spec** | `02-signing-keys/server-side-signing.md` |
| **Status** | ⚪ **ACCEPTED** — intentional simplification, single Stellar keypair |
| **Found** | Code audit, iteration 2 |
| **Impact** | Key purpose separation violated. A vulnerability in the SEP-10 authentication flow that leaks key material would directly compromise the Stellar funding account. |

**Description:** `SEP10_MASTER_SECRET` is set to `FUNDING_SECRET` at `constants.ts:43` rather than being loaded from its own environment variable. This means the Stellar key that holds and moves XLM funds is the same key used for SEP-10 web authentication challenges. The blast radius of a SEP-10 compromise is amplified from "authentication broken" to "funding account drained."

**CTO Clarification (2026-04-02):** Intentional simplification — only one Stellar keypair is used. Accepted risk for now.

---

### F-023: Monerium SEPA Timeout May Be Too Short (SUPERSEDED)

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/phases/handlers/monerium-onramp-mint-handler.ts` (legacy) |
| **Spec** | `05-integrations/monerium.md` (deprecated) → see `05-integrations/mykobo.md` |
| **Status** | ⚪ **SUPERSEDED** — Monerium is removed; EUR on-ramp now uses Mykobo on Base with a 24h outer payment timeout |
| **Found** | Code audit, iteration 2, Module 05 |
| **Impact** | (Historical) Legitimate SEPA on-ramp payments could be marked as failed if Monerium took longer than 30 minutes to mint EURe after SEPA settlement. |

**Description:** The legacy `monerium-onramp-mint-handler.ts` used `PAYMENT_TIMEOUT_MS` (30 minutes) to wait for EURe token arrival on Polygon. SEPA transfers take 1-3 business days to settle.

**Resolution:** The EUR on-ramp has been migrated to Mykobo (`mykobo-onramp-deposit-handler.ts`) which uses a **24-hour `PAYMENT_TIMEOUT_MS`** with a 5-minute inner balance-check timeout that surfaces as a recoverable error. This matches SEPA business-day cutoffs and removes the original 30-minute tightness. The legacy 30-minute window is no longer reached by any active corridor.

---

### F-024: No Concurrent SEPA Ramp Limit Per User (CARRIED FORWARD TO MYKOBO)

| Field | Value |
|---|---|
| **Location** | Ramp creation flow (no per-user limit enforcement) |
| **Spec** | `05-integrations/mykobo.md` (formerly `monerium.md`) |
| **Status** | ✅ **FIXED** — superseded by a stricter one-active-ramp limit for every corridor |
| **Found** | Code audit, iteration 2, Module 05 |
| **Impact** | Resource exhaustion — an attacker could create many SEPA-based ramps without paying, tying up system resources (polling, state tracking, phase processing). With Mykobo's 24h outer timeout the exposure window per pending ramp is **larger** than under the previous 30-minute Monerium window. |

**Description:** No per-user concurrent ramp limit is enforced for Mykobo SEPA on-ramp flows (previously: Monerium). A user can create unlimited pending SEPA ramps. Each ramp consumes: (1) a database row with state tracking, (2) periodic phase processing cycles (polling for EURC arrival on Base), (3) a slot in the phase processor queue. With Mykobo's 24h timeout, each unpaid ramp now stays active for up to 24 hours rather than 30 minutes.

**CTO Clarification (2026-04-02):** Yes, add a per-user limit on concurrent pending SEPA ramps. Suggested max: 3.

**Fix (2026-07-14):** `registerRamp` now locks the authenticated user's profile row and rejects registration when any nonterminal ramp already exists. This enforces a stricter limit of one active ramp across every corridor and serializes concurrent requests across API instances. Unstarted ramps older than the 15-minute start window are transitioned to `timedOut` before the check, preventing abandoned registrations from blocking the user indefinitely.

---

### F-027: `squidRouterPermitExecutionValue` Used as `msg.value` Without Validation

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/phases/handlers/squidrouter-permit-execution-handler.ts`, lines 123, 132 |
| **Spec** | `05-integrations/squid-router.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Code audit, iteration 2, Module 05 |
| **Impact** | If ramp state is corrupted or manipulated, an unbounded `msg.value` could drain the executor account's native token (GLMR) balance. |

**Description:** `state.state.squidRouterPermitExecutionValue` is read with a non-null assertion (`!`) and cast directly to `BigInt` without any validation:
- No null/undefined check (runtime `BigInt(null)` or `BigInt(undefined)` throws, potentially crashing the handler)
- No range validation (no maximum cap)
- No sanity check against expected values

This value is used as `msg.value` in the `TokenRelayer.execute()` call, meaning it controls how much native GLMR is sent from `MOONBEAM_EXECUTOR_PRIVATE_KEY`. The value originates from presigned transaction data (server-constructed at ramp creation), so manipulation requires database access. However, defense-in-depth suggests validating this value.

**Fix:** Add a maximum cap check (similar to `MAX_FINAL_SETTLEMENT_SUBSIDY_USD`). Also add a null check with an unrecoverable error instead of relying on the non-null assertion.

---

### F-028: Hydration→AssetHub Nonce Guard is Warning-Only; Stale Gas in Moonbeam Retry Loop

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/phases/handlers/hydration-to-assethub-xcm-phase-handler.ts`, lines 28-32; `moonbeam-to-pendulum-handler.ts`, line 105 |
| **Spec** | `06-cross-chain/xcm-transfers.md`, Invariant 7 |
| **Status** | ✅ **FIXED** |
| **Found** | Code audit, iteration 2, Module 06 |
| **Impact** | (1) Hydration handler: unnecessary error churn on retry after crash — nonce mismatch is logged as warning but submission proceeds, causing a chain-level rejection. (2) Moonbeam handler: gas price estimated once and reused across 5 retries (~100s window), potentially causing later attempts to underprice. |

**Description:** Two related issues in XCM handlers:

1. In `hydration-to-assethub-xcm-phase-handler.ts`, the nonce guard (lines 28-32) compares `currentEphemeralAccountNonce > nonce` but only logs a warning. Unlike the Spacewalk redeem handler (which correctly skips to the waiting path), this handler continues to submit the extrinsic, which will be rejected by the chain due to stale nonce.

2. In `moonbeam-to-pendulum-handler.ts`, `estimateFeesPerGas()` is called once (line 105) before the 5-attempt retry loop (lines 109-126). Each retry waits 20 seconds — across 5 attempts, the gas estimate can become stale in volatile conditions.

**Fix:** (1) Change the Hydration handler to skip re-submission when nonce indicates prior execution, similar to `spacewalk-redeem-handler.ts`. (2) Move `estimateFeesPerGas()` inside the retry loop so each attempt uses a fresh gas estimate.

---

### F-030: No Output Validation on SquidRouter Swap in Final Settlement Subsidy

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/phases/handlers/final-settlement-subsidy.ts`, lines 216-264 (swap), lines 276-309 (transfer retry) |
| **Spec** | `06-cross-chain/fund-routing.md`, Threat Vector: "SquidRouter swap manipulation" |
| **Status** | ✅ **FIXED** |
| **Found** | Code audit, iteration 2, Module 06 |
| **Impact** | If the SquidRouter API returns a malicious or severely unfavorable route, the swap executes without verifying the output amount. |

**Description:** The `final-settlement-subsidy.ts` handler performs a SquidRouter swap (native → ERC-20) to top up the funding account when it has insufficient ERC-20 balance. The swap route is fetched from the SquidRouter API and executed. After the swap, the handler waits for the funding account's ERC-20 balance to meet the required subsidy amount. However, the handler does not compare the actual swap output against the expected output — if the route is manipulated, native tokens are lost.

**Fix:** After fetching the swap route, validate that `swapRoute.estimate.toAmount` is within an acceptable range of `subsidyAmountRaw` (e.g., ≥80%). If it's dramatically lower, abort with an unrecoverable error.

---

### F-032: No Pre-Check of Pendulum Funding Account Balance in Subsidy Handlers

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/phases/handlers/subsidize-pre-swap-handler.ts`, lines 68-79; `subsidize-post-swap-handler.ts`, lines 100-110 |
| **Spec** | `06-cross-chain/fund-routing.md`, Invariant 8 |
| **Status** | ✅ **FIXED** |
| **Found** | Code audit, iteration 2, Module 06 |
| **Impact** | If the Pendulum funding account runs out of tokens, subsidization transactions will fail on-chain, consuming transaction fees and triggering opaque recoverable errors without surfacing the root cause. |

**Description:** Both subsidy handlers call `apiManager.executeApiCall()` to transfer tokens from the funding account to the ephemeral account, but neither checks the funding account's balance first. Insufficient balance creates a retry loop that won't resolve until the funding account is manually topped up, without clear diagnostics.

**Fix:** Before executing the subsidization transfer, query the funding account's balance for the target token. If insufficient, throw a clear unrecoverable error (e.g., "Funding account balance too low for subsidy: has X, needs Y").

---

### F-034: Rebalancer SquidRouter Swap Has No Output Validation and Axelar Polling Has No Timeout

| Field | Value |
|---|---|
| **Location** | `apps/rebalancer/src/rebalance/brla-to-axlusdc/steps.ts`, lines 202-278 |
| **Spec** | `07-operations/rebalancer.md`, Audit Checklist item 9 |
| **Status** | 🟡 **DEFERRED** — requires rebalancer app changes |
| **Found** | Code audit, iteration 2, Module 07 |
| **Impact** | (1) Received amount on Moonbeam could be significantly less than expected due to slippage, MEV extraction, or routing degradation — undetected. (2) If Axelar never reaches "executed" status, the rebalancer enters an infinite polling loop. |

**Description:** In `transferUsdcToMoonbeamWithSquidrouter` (step 5):

1. **No output validation**: After the SquidRouter swap completes on Moonbeam, the code never queries the actual received balance to verify it matches the SquidRouter estimate.
2. **Infinite polling loop** (lines 261-276): The Axelar status polling uses a `while(true)` loop that only exits when `status === "executed"`. No maximum poll count, no timeout, no handling for permanent failure states.

**Fix:**
1. **Output validation**: After the swap, query the USDC balance on Moonbeam and compare to the expected amount. Log a warning if the difference exceeds a threshold (e.g., 2%), and abort if it exceeds a critical threshold (e.g., 10%).
2. **Polling timeout**: Add a maximum timeout (e.g., 30 minutes) or maximum poll count. On timeout, save state with an "axelar_timeout" marker and exit with a non-zero code.
3. **Failure states**: Handle Axelar status values other than "executed" — at minimum, log and exit on "failed" or "error" statuses.

---

### F-035: 50MB JSON Body Parser Limit Enables Memory Exhaustion

| Field | Value |
|---|---|
| **Location** | `apps/api/src/config/express.ts`, lines 61-62 |
| **Spec** | `07-operations/api-surface.md`, Invariant 3 |
| **Status** | ✅ **FIXED** |
| **Found** | Code audit, iteration 2, Module 07 |
| **Impact** | A single IP can send 100 requests/minute × 50MB = 5GB/minute of JSON that the server must parse and hold in memory. |

**Description:** The Express configuration sets `bodyParser.json({ limit: "50mb" })`. For a payment API where the largest legitimate payload is a few KB, this limit is ~10,000x larger than necessary.

**CTO Clarification (2026-04-02):** No endpoint needs more than ~1MB. The 50MB limit was not intentional.

**Fix:** Reduce the body parser limit to `1mb`.

---

### F-036: Staging CORS Origin Always Present in Production Whitelist

| Field | Value |
|---|---|
| **Location** | `apps/api/src/config/express.ts`, lines 31-37 |
| **Spec** | `07-operations/api-surface.md`, Threat Vectors table |
| **Status** | ✅ **FIXED** |
| **Found** | Code audit, iteration 2, Module 07 |
| **Impact** | An XSS vulnerability on the staging frontend would grant the attacker cross-origin access to the production API with full cookie credentials. |

**Description:** The CORS origin whitelist in `express.ts` includes `staging--pendulum-pay.netlify.app` unconditionally — it is not gated behind a `NODE_ENV !== 'production'` check.

**CTO Clarification (2026-04-02):** Oversight. Staging should NOT be in the production CORS whitelist.

**Fix:** Gate the staging origin behind the same `NODE_ENV` check as localhost.

---

### F-043: `areAllTxsIncluded` Matches Metadata Only — Transaction Content Not Verified

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/transactions/validation.ts`, lines 24-40 |
| **Spec** | `03-ramp-engine/transaction-validation.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Transaction validation audit, 2026-04-07 |
| **Impact** | A malicious client can substitute completely different transaction data while preserving the metadata envelope, bypassing the inclusion check. |

**Description:** `areAllTxsIncluded()` verifies that the client's presigned transactions cover all expected phases by matching on `phase`, `network`, `nonce`, and `signer` metadata. It does NOT compare the actual `txData` content. This means a client could:

1. Receive the server's unsigned transactions (which define the expected txData)
2. Replace the txData with a malicious payload (e.g., redirecting a payment, changing a swap amount)
3. Keep the phase/network/nonce/signer metadata identical
4. Submit the modified transactions — `areAllTxsIncluded` passes because metadata matches

While `validatePresignedTxs` provides a second layer of validation, it has its own gaps (F-038 through F-042). The inclusion check should be a strong first gate.

**Fix:** Include a content comparison in `areAllTxsIncluded` — either compare txData directly (hash or deep equality) against the server-generated expected transactions, or include a server-side signature/HMAC over the expected txData that the client cannot forge.

---

### F-046: SEPA Onramp Ramps Excluded from Cleanup

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/workers/cleanup.worker.ts`, line 156 |
| **Spec** | `03-ramp-engine/ephemeral-accounts.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Ephemeral account audit, 2026-04-07 |
| **Impact** | If a SEPA (Monerium) onramp fails after EURe is minted to the Polygon ephemeral account, the tokens are trapped with no cleanup mechanism. |

**Description:** The cleanup worker explicitly excludes SEPA ramps:

```typescript
from: { [Op.ne]: "sepa" }
```

This exclusion means that Monerium SEPA onramp ramps are never processed by the cleanup worker, regardless of their completion status. If a SEPA ramp completes normally, residual EURe dust on the Polygon ephemeral account is lost. If a SEPA ramp fails after Monerium mints EURe but before the tokens are bridged via SquidRouter, the full minted amount is trapped.

The exclusion may have been added because SEPA ramps have a different lifecycle (polling for Monerium mint), but the cleanup concern remains: tokens on Polygon ephemeral accounts need to be swept.

**Fix:** Evaluate whether SEPA ramps can leave residual tokens on ephemeral accounts (Polygon, Moonbeam, Pendulum). If yes, either: (1) remove the exclusion and handle SEPA ramps in the standard cleanup flow, or (2) add a SEPA-specific cleanup handler that accounts for the Monerium integration's lifecycle.

---

### F-047: `getTransactionTypeForPhase` Default Silently Maps Unknown Phases to EVM

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/transactions/validation.ts`, lines 42-70 |
| **Spec** | `03-ramp-engine/transaction-validation.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Transaction validation audit (checklist walkthrough), 2026-04-07 |
| **Impact** | A new phase added to `RampPhase` that is actually Substrate-type would silently fall through to EVM validation, either throwing a confusing error or — if the txData happens to parse as valid EVM — passing without any meaningful check. |

**Description:** The `getTransactionTypeForPhase()` switch statement maps known phases to their chain type (`Substrate`, `Stellar`, or `EVM`). The `default` case returns `EphemeralAccountType.EVM`. Approximately 15 `RampPhase` values are not in the switch:

- `squidRouterPermitExecute`, `squidRouterPay`, `moneriumOnrampSelfTransfer`, `moneriumOnrampMint`
- `fundEphemeral`, `destinationTransfer`, `moonbeamToPendulum`
- `alfredpayOnrampMint`, `alfredpayOfframpTransfer`
- `brlaOnrampMint`, `brlaPayoutOnMoonbeam`, `finalSettlementSubsidy`
- `backupSquidRouterApprove`, `backupSquidRouterSwap`, `backupApprove`

Most of these happen to be EVM transactions, so the default is accidentally correct. But this is fragile: if a developer adds a new Substrate-type phase without updating the switch, it silently gets EVM validation. Additionally, `squidRouterPermitExecute` falls to the default EVM path, where typed data is then skipped by the early return — creating a double bypass.

**Fix:** Replace `default: return EphemeralAccountType.EVM` with a throw: `default: throw new Error(\`Unknown phase type: ${phase}\`)`. Explicitly add all missing phases to the appropriate case groups.

---

### F-049: `stellarCleanup` Phase Gets No Content Validation

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/transactions/validation.ts`, lines 207-302 |
| **Spec** | `03-ramp-engine/transaction-validation.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Transaction validation audit (checklist walkthrough), 2026-04-07 |
| **Impact** | A malicious client could substitute a different cleanup XDR that merges the Stellar ephemeral account to an attacker address instead of the server funding account. |

**Description:** The `stellarCleanup` phase is correctly mapped to `EphemeralAccountType.Stellar` in `getTransactionTypeForPhase`, so it enters `validateStellarTransaction`. However, that function only has phase-specific content checks for `stellarCreateAccount` (if block at line 236) and `stellarPayment` (if block at line 287). The `stellarCleanup` phase falls through both if-blocks and receives only:

1. Signer matches expected signer
2. XDR parses successfully

No validation of: merge destination, operation types, or operation count. The cleanup XDR typically contains an account merge operation that sends the ephemeral account's remaining balance to the server funding account. Without checking the merge destination, a malicious client could craft a cleanup XDR that merges to their own address.

**Fix:** Add a `stellarCleanup` phase check that validates: (1) operation count, (2) operation type is `accountMerge`, (3) merge destination is the server's Stellar funding public key.

---

### F-050: EVM Transaction `to` Address (Contract Target) Not Validated

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/transactions/validation.ts`, lines 101-151 |
| **Spec** | `03-ramp-engine/transaction-validation.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Transaction validation audit (checklist walkthrough), 2026-04-07 |
| **Impact** | A presigned EVM transaction could target any arbitrary contract address. For `squidRouterApprove`, the client could approve a malicious spender. For `squidRouterSwap`, the client could route through a malicious router contract that skims funds. |

**Description:** `validateEvmTransaction` deserializes the transaction and checks:
- `from` matches expected signer ✅
- `chainId` matches expected network ✅

But it does NOT check `to` (the contract target address). The `to` field determines which smart contract the transaction interacts with. For presigned transactions, the server generates unsigned transactions with specific `to` addresses (e.g., the SquidRouter contract, an ERC-20 token contract for approvals). The client could replace the `to` address with:
- A malicious router contract that executes the swap but sends output to an attacker
- A malicious token contract for the approval, granting allowance on the wrong token
- Any arbitrary contract

**Fix:** Validate that `transactionMeta.to` matches the expected contract address for the phase. For `squidRouterApprove`, verify `to` is the expected ERC-20 token contract. For `squidRouterSwap`, verify `to` is the known SquidRouter contract address.

---

### F-051: No Alerting or Monitoring for Cleanup Failures

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/workers/cleanup.worker.ts` |
| **Spec** | `03-ramp-engine/ephemeral-accounts.md` |
| **Status** | 🟡 **DEFERRED** |
| **Found** | Ephemeral account audit (checklist walkthrough), 2026-04-07 |
| **Impact** | Cleanup failures accumulate silently. Funds trapped on ephemeral accounts go unnoticed until someone manually inspects logs or the database. |

**CTO Decision (2026-04-10):** Deferred — cleanup alerting is not crucial at this stage.

**Description:** The cleanup worker logs errors via `logger.error()` and retries failed handlers on subsequent cycles, but never sends a Slack alert or triggers any monitoring notification. `SlackNotifier` exists and is used elsewhere in the codebase (e.g., balance alerts in `pendulum.controller.ts`) but is not wired into the cleanup worker.

If a cleanup handler fails repeatedly (e.g., due to an RPC outage on a specific chain), the ramp's `postCompleteState.cleanup.errors` array grows but nobody is notified. The 5-minute cron cycle keeps retrying the same failed handlers indefinitely, but if the root cause requires manual intervention (e.g., an expired Stellar account, a chain upgrade that changed the extrinsic format), funds remain trapped.

**Fix:** Add `SlackNotifier` integration to the cleanup worker. Send an alert when: (1) a cleanup handler fails for the same ramp more than N times (e.g., 3 consecutive cycles = 15 minutes), or (2) the total number of ramps with failed cleanup exceeds a threshold. Include the ramp ID, handler name, and error message in the alert.

---

### F-052: No Manual Cleanup Trigger Endpoint

| Field | Value |
|---|---|
| **Location** | No endpoint exists — gap in `apps/api/src/api/routes/v1/` |
| **Spec** | `03-ramp-engine/ephemeral-accounts.md` |
| **Status** | 🟡 **DEFERRED** |
| **Found** | Ephemeral account audit (checklist walkthrough), 2026-04-07 |
| **Impact** | If automated cleanup fails repeatedly for a specific ramp, there is no way to manually trigger a cleanup attempt without direct database modification or service restart. |

**CTO Decision (2026-04-10):** Deferred — manual cleanup trigger is not crucial at this stage.

**Description:** The cleanup worker runs on a 5-minute cron and processes ramps automatically. However, there is no admin API endpoint to manually trigger cleanup for a specific ramp ID. If a ramp's cleanup is stuck (e.g., the handler keeps failing due to a chain-specific issue that has since been resolved), an operator must either:
- Wait for the next automatic cycle (which will retry the same failed handler)
- Directly modify the database to reset the cleanup state
- Restart the service

None of these are ideal for an operations team responding to a stuck-funds incident.

**Fix:** Add an admin-authenticated endpoint (e.g., `POST /v1/admin/cleanup/:rampId`) that: (1) validates the ramp exists and has `currentPhase: "complete"` or `"failed"`, (2) resets the cleanup error state, (3) triggers post-process handlers immediately for that ramp, (4) returns the result. Protect with `adminAuth` middleware.

---

### F-055: Unlimited ERC-20 Approval (maxUint256) in Backup Presigned Transactions

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/transactions/onramp/routes/monerium-to-evm.ts:183-203`, `alfredpay-to-evm.ts:190-209`, `avenia-to-evm.ts:235-254` |
| **Spec** | `03-ramp-engine/transaction-validation.md` |
| **Status** | 🟡 **ACCEPTED** |
| **Found** | Transaction validation audit (agent investigation), 2026-04-07 |
| **Impact** | The ephemeral account signs an unlimited (`2^256 - 1`) ERC-20 token approval to the platform's funding account. If the signed `backupApprove` transaction is broadcast (by the platform or an attacker who obtains the raw tx data), the funding account gains unlimited transfer authority over ALL tokens of that type on the ephemeral account — not just the ramp's expected amount. |

**CTO Decision (2026-04-10):** Accepted — backup mechanism with unlimited approval is intentional for manual recovery of failed SquidRouter swaps. Kept as-is.

**Description:** All three onramp-to-EVM routes compute a `backupApprove` presigned transaction with:

```typescript
const maxUint256 = 2n ** 256n - 1n;
const fundingAccount = privateKeyToAccount(MOONBEAM_FUNDING_PRIVATE_KEY as `0x${string}`);
const backupApproveTransaction = await addDestinationChainApprovalTransaction({
  amountRaw: maxUint256.toString(),
  destinationNetwork: toNetwork as EvmNetworks,
  spenderAddress: fundingAccount.address,
  tokenAddress: bridgedTokenForFallback
});
```

The spender is the platform's Moonbeam funding account (an EOA derived from `MOONBEAM_FUNDING_PRIVATE_KEY`). While this account is controlled by the platform, the approval amount is excessively permissive. If the funding account's private key is compromised, the attacker could drain ALL ephemeral accounts that have signed this approval — not just the ramp amount.

Additionally, the `backupApprove` nonce is set to `0` (or `polygonAccountNonce` for Polygon), meaning on non-Polygon networks the tx is valid starting from the ephemeral account's first transaction.

**Fix:** Replace `maxUint256` with the exact expected backup transfer amount (e.g., `quote.outputAmountRaw` plus a small buffer). This limits the blast radius if the funding key is compromised.

---

### F-056: `sandboxEnabled` Bypasses ChainId Validation and Skips Entire Ramp Flow

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/phases/handlers/initial-phase-handler.ts:32-35`; `apps/api/src/api/services/transactions/validation.ts:145` |
| **Spec** | `03-ramp-engine/transaction-validation.md`, `03-ramp-engine/state-machine.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Transaction validation audit (code review), 2026-04-07 |
| **Impact** | If `SANDBOX_ENABLED=true` is accidentally set in production (or if an attacker can influence environment variables), ALL ramps skip every phase and immediately complete, and EVM chainId validation is disabled. Funds would not actually move, but ramps would appear successful. |

**Description:** Two critical behaviors change when `config.sandboxEnabled` is `true`:

1. **Initial phase handler** (line 32-35): Instead of routing to the correct first phase based on ramp type and currency, the handler waits 10 seconds and transitions directly to `"complete"`:
   ```typescript
   if (config.sandboxEnabled) {
     await new Promise(resolve => setTimeout(resolve, 10000));
     return this.transitionToNextPhase(state, "complete");
   }
   ```

2. **EVM transaction validation** (line 145): The chainId check is skipped:
   ```typescript
   if (Number(transactionMeta.chainId) !== getNetworkId(tx.network) && Boolean(config.sandboxEnabled) !== true) {
   ```

There is no runtime guard to ensure `sandboxEnabled` cannot be `true` when `NODE_ENV=production`. The value is read directly from `process.env.SANDBOX_ENABLED === "true"` in `config/vars.ts`.

**Fix:** Add an explicit guard in `config/vars.ts` or at app startup: if `NODE_ENV === "production"` and `SANDBOX_ENABLED === "true"`, throw an error and refuse to start. Additionally, log a warning at startup when sandbox mode is active.

---

### F-057: `destinationTransfer` Handler Sends Presigned Transaction Without Validating Destination Address

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/phases/handlers/destination-transfer-handler.ts:40,74-76` |
| **Spec** | `03-ramp-engine/transaction-validation.md`, `03-ramp-engine/ephemeral-accounts.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Transaction validation audit (agent investigation), 2026-04-07 |
| **Impact** | The `DestinationTransferHandler` retrieves the presigned `destinationTransfer` transaction and broadcasts it via `sendRawTransactionWithRetry()` without independently verifying that the transfer's `to` address matches the user's destination address from the quote. Combined with F-050 (EVM `to` address not validated during presigned tx submission), a malicious API client could craft a presigned `destinationTransfer` that sends tokens to an attacker's address instead of the user's address. |

**Description:** The handler at line 40 retrieves the raw presigned tx:
```typescript
const { txData: destinationTransfer } = this.getPresignedTransaction(state, "destinationTransfer");
```

At line 74, it broadcasts it directly:
```typescript
const txHash = await evmClientManager.sendRawTransactionWithRetry(
  quote.network as EvmNetworks,
  destinationTransfer as `0x${string}`
);
```

The handler does check the expected amount via `checkEvmBalanceForToken` (ensuring the ephemeral account has the tokens), but never decodes the presigned transaction to verify that the `to` address matches `quote.toAddress` or any expected recipient. Since F-050 shows that `validatePresignedTxs` also doesn't check `to`, there is no validation of the destination address anywhere in the pipeline.

**Fix:** Before broadcasting, decode the raw presigned `destinationTransfer` transaction and verify that the `to` address (the ERC-20 transfer recipient) matches the expected destination from the quote. Alternatively, fix F-050 to validate `to` during the presigned tx submission step, which would cover this case systemically.

---

## 🔵 Low / ⚪ Info

### F-017: Database TLS Not Explicitly Configured

| Field | Value |
|---|---|
| **Location** | `apps/api/src/config/database.ts` |
| **Spec** | `00-system-overview/architecture.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Code audit, iteration 2 |
| **Impact** | If the database server does not enforce TLS, connections could be unencrypted, exposing credentials and data in transit. |

**Description:** The Sequelize configuration does not include `dialectOptions.ssl`. Whether TLS is used depends entirely on the database server configuration.

**Fix:** Add `dialectOptions: { ssl: { require: true, rejectUnauthorized: true } }` to the Sequelize configuration for production.

---

### F-018: Token Verification Uses Anon-Key Supabase Client Instead of Service-Role Client

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/auth/supabase.service.ts:147` |
| **Spec** | `01-auth/supabase-otp.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Code audit, iteration 2 |
| **Impact** | Functionally correct but deviates from spec and best practice. |

**Description:** `SupabaseAuthService.verifyToken()` calls `supabase.auth.getUser(accessToken)` using the anon-key client, not `supabaseAdmin.auth.getUser(accessToken)` with the service-role key. The spec explicitly requires "MUST use `SUPABASE_SERVICE_KEY`."

**Fix:** Change `supabase.auth.getUser(accessToken)` to `supabaseAdmin.auth.getUser(accessToken)`.

---

### F-019: No Startup Validation for Supabase Configuration

| Field | Value |
|---|---|
| **Location** | `apps/api/src/config/vars.ts:115-118`, `apps/api/src/config/supabase.ts` |
| **Spec** | `01-auth/supabase-otp.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Code audit, iteration 2 |
| **Impact** | Service starts normally with empty Supabase config — all authenticated endpoints silently return 401. |

**Description:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_KEY` all default to empty string `""` in `vars.ts`. No startup validation checks these values.

**Fix:** Add startup validation that terminates the process if any of the three Supabase config values are empty when `NODE_ENV === "production"`.

---

### F-020: Failed Admin Auth Attempts Not Logged

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/middlewares/adminAuth.ts` |
| **Spec** | `01-auth/admin-auth.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Code audit, iteration 2 |
| **Impact** | Brute-force attacks against admin endpoints are invisible in server logs. |

**Description:** The `adminAuth` middleware only logs errors that occur during the authentication process (exceptions in the catch block). Intentional rejections — missing auth header (401) and invalid token (403) — produce no log output.

**Fix:** Add `logger.warn()` for both rejection paths with IP, path, and reason.

---

### F-021: No Address Format Validation for Ephemeral Accounts

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/ramp/ramp.service.ts:63-88` (`normalizeAndValidateSigningAccounts`) |
| **Spec** | `02-signing-keys/ephemeral-accounts.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Code audit, iteration 2 |
| **Impact** | Malformed or empty addresses accepted for ramp registration. Transactions with invalid addresses fail unpredictably deep in the pipeline. |

**Description:** `normalizeAndValidateSigningAccounts()` validates that `account.type` is a valid `EphemeralAccountType` but `account.address` is **never validated** — no format check for any chain type.

**Fix:** Add chain-specific address validation:
- Stellar: `StrKey.isValidEd25519PublicKey(address)`
- Substrate: SS58 decode or prefix check
- EVM: `isAddress(address)` from viem/ethers

---

### F-025: `HORIZON_URL` Import Inconsistency

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/phases/helpers/stellar-payment-verifier.ts` line 4 vs `apps/api/src/api/services/phases/handlers/helpers.ts` line 5 |
| **Spec** | `05-integrations/stellar-anchors.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Code audit, iteration 2, Module 05 |
| **Impact** | If local constants and shared package diverge in `HORIZON_URL` definition, the payment verifier could check a different Horizon server than the one used for payment submission. |

**Description:** `stellar-payment-verifier.ts` imports `HORIZON_URL` from the local constants file, while other Stellar handlers import it from `@vortexfi/shared`. This creates a maintenance risk if the two sources diverge.

**Fix:** Standardize all `HORIZON_URL` imports to use `@vortexfi/shared`.

---

### F-026: `@ts-ignore` on Nonce Access in Spacewalk Redeem Handler

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/phases/handlers/spacewalk-redeem-handler.ts`, lines 72-73 |
| **Spec** | `05-integrations/stellar-anchors.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Code audit, iteration 2, Module 05 |
| **Impact** | If Polkadot API types change in a dependency update, `.nonce.toNumber()` may silently return incorrect values, breaking the nonce re-execution guard. |

**Description:** `// @ts-ignore` is used before `api.query.system.account(pendulumEphemeralAddress)` to suppress a type error. The `.nonce.toNumber()` call relies on a specific shape of the returned account info that the TypeScript types no longer reflect.

**Fix:** Replace `@ts-ignore` with proper type handling — cast through a known interface using `.toJSON()` with an appropriate type assertion.

---

### F-031: Post-Swap Routing Has No Default Error Case

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/phases/handlers/subsidize-post-swap-handler.ts`, lines 128-148 |
| **Spec** | `06-cross-chain/fund-routing.md`, Invariant 7 |
| **Status** | ✅ **FIXED** |
| **Found** | Code audit, iteration 2, Module 06 |
| **Impact** | If a new ramp flow is added with an unrecognized routing combination, it would silently fall through to `spacewalkRedeem`, which may not be correct. |

**Description:** The `nextPhaseSelector` method uses a series of `if` statements to determine the next phase, with `return "spacewalkRedeem"` as an implicit catch-all. Future SELL flows with different output currencies could be silently misrouted.

**Fix:** Add an explicit `else` clause that throws an error for unrecognized combinations.

---

### F-058: No Per-Presigned-Transaction TTL After Ramp Starts

| Field | Value |
|---|---|
| **Location** | `apps/api/src/models/rampState.model.ts` (presignedTxs JSONB field); `apps/api/src/api/services/phases/base-phase-handler.ts` (`getPresignedTransaction`) |
| **Spec** | `03-ramp-engine/transaction-validation.md` |
| **Status** | 🔵 **ACCEPTED** |
| **Found** | Transaction validation audit (agent investigation), 2026-04-07 |
| **Impact** | Once a ramp starts, presigned transactions stored in `RampState.presignedTxs` have no expiry. If a ramp gets stuck in a non-terminal phase and the recovery worker retriggers it days later, the presigned transactions (which may reference stale nonces, changed on-chain state, or revoked approvals) will be used as-is. |

**CTO Decision (2026-04-10):** Accepted — no-age-limit is intentional so stuck ramps can always be continued regardless of timing.

**Description:** The `PresignedTx` model has no `createdAt` or `expiresAt` field. `getPresignedTransaction()` simply does `state.presignedTxs?.find(tx => tx.phase === phase)` with no age check. While the `RampRecoveryWorker` detects stale ramps (>10 min inactive) and retriggers processing, this recovery mechanism uses the same presigned transactions regardless of age.

Time-related constraints that exist:
- `RAMP_START_EXPIRATION_TIME_SECONDS` (480s / 8 min) — enforced at `startRamp()` only, before processing begins
- `MAX_EXECUTION_TIME_MS` (10 min) — per-phase timeout in `PhaseProcessor`
- `RampRecoveryWorker` — retriggers stale ramps after 10 min of inactivity

None of these invalidate the presigned transactions themselves. A ramp could theoretically be retried many hours after its presigned transactions were created, if repeated failures and recoveries occur.

**Fix:** Add an optional `createdAt` timestamp to the `PresignedTx` structure and enforce a maximum age (e.g., 1 hour) in `getPresignedTransaction()`. If the presigned tx is older than the limit, throw an unrecoverable error and transition the ramp to `failed` instead of attempting to use stale transactions.

---

## 🔴🟠🟡 Smart Contract Findings (All Verified Fixed)

All 12 TokenRelayer findings from two prior security reviews have been **verified as fixed** in the current contract (`TokenRelayer.sol`, pragma ^0.8.28):

| ID | Severity | Finding | Status |
|---|---|---|---|
| C-1 | 🔴 Critical | Reentrancy in `execute()` | ✅ Fixed — `ReentrancyGuard` + CEI pattern |
| C-2 | 🔴 Critical | Signature malleability | ✅ Fixed — OZ `ECDSA.recover()` |
| H-1 | 🟠 High | Unlimited token approval | ✅ Fixed — Exact approval + revoke after call |
| H-2 | 🟠 High | Destination mismatch | ✅ Fixed — Hardcoded `destinationContract` in digest |
| M-1 | 🟡 Medium | No ETH recovery | ✅ Fixed — `receive()` + `withdrawETH()` |
| M-2 | 🟡 Medium | Permit front-running | ✅ Fixed — try-catch with allowance fallback |
| M-3 | 🟡 Medium | Test ABI mismatch | ✅ Fixed — `payloadValue` in both test files |
| L-1 | 🔵 Low | Redundant `executedCalls` | ✅ Fixed — Removed |
| L-2 | 🔵 Low | No event for `withdrawToken` | ✅ Fixed — `TokenWithdrawn` + `ETHWithdrawn` events |
| I-1 | ⚪ Info | No access control library | ✅ Fixed — OZ `Ownable` |
| I-2 | ⚪ Info | Redundant return from `execute()` | ✅ Fixed — Returns void |
| I-3 | ⚪ Info | Manual EIP-712 construction | ✅ Fixed — OZ `EIP712` |

---

## Phase 4: Fresh Security Audit Pass (F-059 — F-067)

> Discovered during a comprehensive re-audit of webhooks, input validation, race conditions, amount handling, and SDK security.

### F-059: Quote Double-Binding Race Condition

| Field | Value |
|---|---|
| **Severity** | 🟠 **High** |
| **Location** | `apps/api/src/api/services/ramp/ramp.service.ts` (lines 132-171), `apps/api/src/api/services/ramp/base.service.ts` (lines 116-124), `apps/api/src/models/rampState.model.ts` (lines 228-231) |
| **Spec** | `03-ramp-engine/quote-lifecycle.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Fresh audit pass, race conditions investigation |
| **Impact** | Two concurrent `registerRamp` requests can bind the same quote to two separate ramps, enabling double-spend or duplicate ramp processing. |

**Description:** `registerRamp` runs inside a database transaction, but has three compounding weaknesses:

1. **No `SELECT FOR UPDATE`:** `QuoteTicket.findByPk(quoteId, { transaction })` on line 136 does not acquire a row-level lock. Two concurrent transactions can both read the same quote as `"pending"`.
2. **Unchecked `consumeQuote` return value:** `consumeQuote()` (line 171) returns `[affectedRowCount, updatedRows]`, but the return value is **discarded**. If the first transaction commits and changes status to `"consumed"`, the second transaction's UPDATE matches 0 rows — but the code doesn't notice and proceeds to create a second `RampState`.
3. **No unique constraint on `quoteId`:** The `idx_ramp_quote` index on `rampState.quoteId` is **non-unique**, so the database won't reject duplicate ramps referencing the same quote.

**Exploitation scenario:** Attacker sends two simultaneous `POST /v1/ramp/register` requests with the same `quoteId`. Both transactions read the quote as "pending", both create RampStates, and only one actually flips the quote to "consumed". The second ramp is now bound to a consumed quote but proceeds normally.

**Resolution (Option C):** Applied all three defenses:
1. Added `{ lock: Transaction.LOCK.UPDATE }` to `QuoteTicket.findByPk()` in `ramp.service.ts` to prevent concurrent reads.
2. Changed `consumeQuote()` call to check returned `affectedRows` — throws `CONFLICT` if 0 rows affected (quote already consumed).
3. Migration `026-add-unique-constraint-ramp-quote-id` replaces non-unique `idx_ramp_quote` index with unique constraint `uq_ramp_states_quote_id`. Model updated to reflect unique index.

---

### F-060: Subsidy Amount Validation Missing Positive/NaN Guards

| Field | Value |
|---|---|
| **Severity** | 🟡 **Medium** |
| **Location** | `apps/api/src/api/controllers/subsidize.controller.ts` (lines 28-32), `apps/api/src/api/services/phases/handlers/subsidize-pre-swap-handler.ts`, `subsidize-post-swap-handler.ts` |
| **Spec** | `06-cross-chain/fund-routing.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Fresh audit pass, amount handling investigation |
| **Impact** | Negative, zero, NaN, or Infinity subsidy amounts could propagate to on-chain token transfers. |

**Description:** `validateSubsidyAmount()` only checks that the amount doesn't exceed `maximumSubsidyAmountRaw`. It does **not** reject:
- Negative amounts (e.g., `"-1000"`)
- Zero amounts
- Non-numeric strings (e.g., `"NaN"`, `"Infinity"`)

The REST endpoints (`/v1/subsidize/preswap`, `/v1/subsidize/postswap`) are **not mounted** in the v1 router (dead code), so the public attack surface is limited. However, the same `validateSubsidyAmount` function is used by the internal phase handlers (`SubsidizePreSwapPhaseHandler`, `SubsidizePostSwapPhaseHandler`), which call it with values derived from quote metadata. A corrupted or manipulated quote could propagate invalid amounts through the internal subsidy flow.

**Resolution:** Added try/catch around `Big(amount)` construction to reject non-numeric strings, added `amountBig.lte(0)` guard to reject zero and negative values. Both checks now throw before the max-amount check.

---

### F-061: No Maximum Amount Enforcement in Quote Finalization

| Field | Value |
|---|---|
| **Severity** | 🟡 **Medium** |
| **Location** | `apps/api/src/api/services/quote/engines/finalize/onramp.ts` (line 83), `apps/api/src/api/services/quote/engines/finalize/offramp.ts` (line 48), `apps/api/src/api/services/quote/core/validation-helpers.ts` |
| **Spec** | `03-ramp-engine/quote-lifecycle.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Fresh audit pass, amount handling investigation |
| **Impact** | Users can create quotes with arbitrarily large amounts, potentially exceeding intended per-ramp limits. |

**Description:** `validateAmountLimits()` is a generic helper that supports both `"min"` and `"max"` limit types, and token configs define `maxBuyAmountRaw` / `maxSellAmountRaw`. However, the finalize engines **only call it with `"min"`**:

- `OnRampFinalizeEngine.validate()` → `validateAmountLimits(..., "min", ...)`
- `OffRampFinalizeEngine.validate()` → `validateAmountLimits(..., "min", ...)`

The `"max"` path is **never invoked** anywhere in the codebase. This means `maxBuyAmountRaw` and `maxSellAmountRaw` in token configs are defined but unenforced.

**Resolution:** Added `validateAmountLimits(..., "max", ...)` calls alongside the existing `"min"` calls in both `OnRampFinalizeEngine.validate()` and `OffRampFinalizeEngine.validate()`.

---

### F-062: SDK Logs API Key to Console

| Field | Value |
|---|---|
| **Severity** | 🟡 **Medium** |
| **Location** | `packages/sdk/src/services/ApiService.ts` (line 19) |
| **Spec** | `07-operations/secret-management.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Fresh audit pass, SDK security investigation |
| **Impact** | API keys are written to the console/log output of any application using the SDK. In Node.js server environments, this could expose the API key in log aggregators. |

**Description:** Line 19 of `ApiService.ts`:
```typescript
console.log("Creating quote with request:", request);
```
The `request` object passed to `createQuote` already has `apiKey` merged in (from `VortexSdk.createQuote()` line 55: `{ ...request, api: true, apiKey: this.apiKey }`). This logs the full request object, including the API key, on every quote creation.

**Resolution:** Removed the `console.log` statement entirely.

---

### F-063: SquidRouter High Slippage Rejection Disabled

| Field | Value |
|---|---|
| **Severity** | 🟡 **Medium** |
| **Location** | `packages/shared/src/services/squidrouter/route.ts` (lines 193-198) |
| **Spec** | `05-integrations/squid-router.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Fresh audit pass, SDK/shared security investigation |
| **Impact** | Routes with aggregate slippage >2.5% are accepted without rejection. Users could receive significantly less value than quoted if SquidRouter returns a high-slippage route. |

**Description:** The code detects high slippage and logs a warning, but the rejection is commented out:
```typescript
if (slippage > 2.5) {
  logger.current.warn(`Received route with high slippage: ${slippage}%. Request ID: ${requestId}`);
  // FIXME: temporarily disabled because we are facing issues with squidrouter routes failing the swap to USDT
  // throw new Error(`The slippage of the route is too high: ${slippage}%. Please try again later.`);
}
```
The `FIXME` comment indicates this was intentionally disabled as a workaround. However, leaving it disabled means there is no protection against high-slippage routes.

**Resolution:** Re-enabled the `throw` statement for routes with slippage >2.5%. The 2.5% threshold remains as the existing hardcoded value.

---

### F-064: BRLA KYC Callback Lacks Inbound Signature Verification

| Field | Value |
|---|---|
| **Severity** | 🟡 **Medium** |
| **Location** | `apps/api/src/api/routes/v1/brla.route.ts` (line 31), `apps/api/src/api/controllers/brla.controller.ts` |
| **Spec** | `05-integrations/brla.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Fresh audit pass, webhook security investigation |
| **Impact** | Anyone can POST to `/v1/brla/kyc/record-attempt` to create or manipulate BRLA TaxId records. The endpoint uses `optionalAuth` (not mandatory), and there is no HMAC/signature verification to prove the request actually came from BRLA. |

**Description:** The `POST /v1/brla/kyc/record-attempt` endpoint is designed to record KYC attempts from the BRLA integration. It uses `optionalAuth` middleware, meaning it can be called without any authentication. There is no HMAC, webhook signature, or IP allowlist to verify the request originates from BRLA.

The endpoint can write to the `TaxId` model (create/update records with KYC status), which is used downstream in the BRL ramp flow to determine whether a user has sufficient KYC level.

**Note:** The system already implements outbound webhook signing (RSA-PSS via `WebhookDeliveryService`), so the pattern for signature verification exists — it just isn't applied to inbound callbacks.

**Resolution:** Changed `optionalAuth` to `requireAuth` on the `/kyc/record-attempt` endpoint in `brla.route.ts`, ensuring only authenticated sessions can record KYC attempts.

---

### F-065: Ephemeral Keys Stored in Plaintext

| Field | Value |
|---|---|
| **Severity** | 🔵 **Low** |
| **Location** | `packages/sdk/src/storage.ts` (lines 3-11) |
| **Spec** | `02-signing-keys/ephemeral-accounts.md` |
| **Status** | 🔵 **ACCEPTED** |
| **Found** | Fresh audit pass, SDK security investigation |
| **Impact** | Ephemeral private keys (Stellar secret, Substrate mnemonic, EVM private key) are stored as plaintext JSON on the filesystem or in `localStorage`. If the host is compromised, all ephemeral keys for active ramps are exposed. |

**Description:** When `storeEphemeralKeys` is enabled (default: `true`), the SDK writes ephemeral secrets to:
- **Node.js:** A JSON file named `ephemerals_{rampId}.json` in the current working directory (no encryption, no restrictive file permissions).
- **Browser:** `localStorage.setItem(fileName, content)` — accessible to any JS running on the same origin.

These files contain the full `{ address, rampId, secret, type }` for each ephemeral account (Stellar, Substrate, EVM). The secrets allow full control of the ephemeral accounts.

**CTO Decision (2026-04-10):** Accepted — Low severity, SDK concern. Ephemeral accounts are temporary and drained during cleanup. Will address in future SDK hardening iteration.

**Mitigating factor:** Ephemeral accounts are temporary and should be drained during cleanup. The exposure window is limited to the ramp's active duration. Also, the SDK is currently documented as Node.js-only.

---

### F-066: No HTTPS Enforcement in SDK API Communication

| Field | Value |
|---|---|
| **Severity** | 🔵 **Low** |
| **Location** | `packages/sdk/src/services/ApiService.ts` (constructor, line 16) |
| **Spec** | `07-operations/api-surface.md` |
| **Status** | 🔵 **ACCEPTED** |
| **Found** | Fresh audit pass, SDK security investigation |
| **Impact** | SDK consumers could configure `apiBaseUrl` with an HTTP URL, sending API keys, quote data, and ephemeral account metadata over an unencrypted connection. |

**Description:** The `ApiService` constructor accepts `apiBaseUrl` as a string with no validation. There is no check that the URL uses HTTPS. All SDK API calls (quote creation, ramp registration, ramp start) use this URL directly via `fetch()`.

**CTO Decision (2026-04-10):** Accepted — Low severity, SDK concern. Production API is served over HTTPS. Primarily affects developer misconfiguration. Will address in future SDK hardening iteration.

**Mitigating factor:** In production, the Vortex API is served over HTTPS. This primarily affects developers misconfiguring the SDK during testing who then forget to switch to HTTPS.

---

### F-067: Fee Calculation Allows Negative Fee Components

| Field | Value |
|---|---|
| **Severity** | 🟡 **Medium** |
| **Location** | `apps/api/src/api/services/quote/core/quote-fees.ts` (lines 43-61, 96-139) |
| **Spec** | `03-ramp-engine/fee-integrity.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Fresh audit pass, amount handling investigation |
| **Impact** | A misconfigured partner fee entry with a negative `markupValue` or `vortexFeeValue` in the database would produce negative fee components, potentially increasing the user's output amount beyond the intended value. |

**Description:** `calculateFeeComponent()` computes fees by either using an absolute value or multiplying a base amount by a relative value. There is no validation that the result is non-negative. `calculatePartnerAndVortexFees()` accumulates these components without a floor check. The `> 0` check on line 114/136 only sets a `hasApplicableFees` flag — it doesn't reject negative values.

If a database partner record has `markupValue = -0.01` and `markupType = "relative"`, the computed markup would be negative, effectively giving the user a discount not intended by the platform.

**Mitigating factor:** Partner records are managed by admins. This isn't directly exploitable by end users — it requires a misconfigured or compromised database entry.

**Resolution:** Added a floor check at the end of `calculateFeeComponent()`: if the computed fee is negative, it is clamped to zero.

---

## Phase 5: Mykobo Integration Audit (F-068 — F-071)

Findings raised during the Mykobo-on-Base EUR rail audit. See `05-integrations/mykobo.md` and `03-ramp-engine/ramp-phase-flows.md`.

---

### F-068: Mykobo KYC Profile Endpoints Have No Authentication

| Field | Value |
|---|---|
| **Severity** | 🔴 **Critical** |
| **Location** | `apps/api/src/api/routes/v1/mykobo.route.ts` (lines 14-15); parent mount at `apps/api/src/api/routes/v1/index.ts` (line 150) |
| **Spec** | `05-integrations/mykobo.md` (Invariant 15), `01-auth/supabase-otp.md` |
| **Status** | ✅ **FIXED** (2026-05-22) |
| **Found** | Mykobo integration audit, 2026-05-22 |
| **Impact** | Anonymous callers can enumerate KYC profiles and submit arbitrary KYC documents (ID, source-of-funds, demographics) tied to any wallet address. This bypasses the spec's "Supabase OTP required" invariant, enables KYC-document submission floods against the Mykobo upstream, and allows attackers to associate attacker-controlled documents with arbitrary identities. |
| **Resolution** | `requireAuth` added to both `/v1/mykobo/profiles` GET and POST routes, mirroring the `alfredpay.route.ts` pattern. The GET endpoint now identifies profiles by the authenticated user's email (`req.userEmail`) via `MykoboApiService.getProfileByEmail`, and rejects requests whose `email` query parameter does not match the authenticated user's email. POST profile creation still ties `wallet_address` to the user's ephemeral, so no separate wallet-ownership check is needed there. Supabase OTP gating plus the email/`req.userEmail` match closes the anonymous-flood and oracle vectors. |

**Description:** `mykobo.route.ts` mounts two endpoints with **no authentication middleware**:

```typescript
router.route("/profiles").get(mykoboController.getProfileController);
router.route("/profiles").post(profileUpload, mykoboController.createProfileController);
```

The parent mount in `routes/v1/index.ts:150` (`router.use("/mykobo", mykoboRoute)`) does not wrap with `requireAuth` either. Compare against the sibling `alfredpay.route.ts`, which applies `requireAuth` on every user-facing endpoint.

Spec `mykobo.md` invariant 15 requires: *"Mykobo KYC profile creation MUST be gated by Vortex auth — The `/v1/mykobo/profiles` endpoints require a Supabase OTP session; anonymous profile creation is rejected."* The code violates this invariant.

The `GET /profiles?email=...&memo=...` endpoint is an email-keyed KYC profile-existence oracle. The `POST /profiles` endpoint accepts multipart form-data (ID document, utility bill, selfie) and forwards it to Mykobo — anonymous callers can submit forged KYC documents linked to arbitrary identities.

**Fix:** Add `requireAuth` middleware to both routes (mirroring `alfredpay.route.ts`):

```typescript
router.route("/profiles").get(requireAuth, mykoboController.getProfileController);
router.route("/profiles").post(requireAuth, profileUpload, mykoboController.createProfileController);
```

After adding auth, also verify that the `email` query parameter on GET matches the authenticated user's email (`req.userEmail`), to prevent an authenticated user from enumerating other users' KYC profile existence.

---

### F-069: EUR Off-Ramp `fundEphemeral` Falls Through to Non-Existent Next Phase

| Field | Value |
|---|---|
| **Severity** | 🟠 **High** |
| **Location** | `apps/api/src/api/services/phases/handlers/fund-ephemeral-handler.ts` (`nextPhaseSelector`, lines 230-250) |
| **Spec** | `03-ramp-engine/ramp-phase-flows.md`, `05-integrations/mykobo.md` |
| **Status** | ✅ **FIXED** (2026-05-22) |
| **Found** | Mykobo integration audit, 2026-05-22 |
| **Impact** | If a EUR off-ramp ever transitions through `fundEphemeral`, `nextPhaseSelector` returns `"moonbeamToPendulum"` — a phase that has no role in the Base-only EUR off-ramp routing (`evm-to-mykobo.ts`). The phase processor would attempt to execute a handler with no presigned transaction registered for this corridor, putting the ramp into a stuck/failed state mid-flow. |
| **Resolution** | Explicit `SELL && outputCurrency === EURC → "distributeFees"` branch added to `nextPhaseSelector`. Additionally, while fixing the latent bug, also added the **active** missing branch `BUY && inputCurrency === EURC → "subsidizePreSwap"` to wire `fundEphemeral` into the Mykobo onramp flow (see the EUR onramp `fundEphemeral` companion fix below). |

**Description:** `nextPhaseSelector` enumerates the SELL-direction branches:

```typescript
if (state.type === RampDirection.SELL && state.from === Networks.AssetHub) {
  return "distributeFees";
} else if (state.type === RampDirection.SELL && isAlfredpayToken(quote.outputCurrency as FiatToken)) {
  return "finalSettlementSubsidy";
} else if (state.type === RampDirection.SELL && quote.outputCurrency === FiatToken.BRL) {
  return "distributeFees";
} else {
  return "moonbeamToPendulum"; // Via contract.subsidizePreSwap
}
```

There is no branch for `outputCurrency === FiatToken.EURC`. The BRL off-ramp uses `distributeFees` as the next phase after `fundEphemeral`; EUR off-ramps need the same routing (the Mykobo Base off-ramp presigned-tx order in `evm-to-mykobo.ts` is `distributeFees(0) → nablaApprove(1) → nablaSwap(2) → mykoboPayoutOnBase(3) → cleanup(4-6)`), but instead they fall through to the `else` branch and target `moonbeamToPendulum`.

**Why this isn't currently surfaced:** The active EUR off-ramp dispatch path (`initial-phase-handler.ts`) does not currently route EUR through `fundEphemeral`. The bug is latent. However, any future routing change, recovery flow, or replay that reaches `fundEphemeral` with `outputCurrency === FiatToken.EURC` will hit the stuck-phase scenario. The integration tests don't catch it because they only exercise `registerRamp`, not `startRamp` through this path.

**Fix:** Add an explicit EURC branch mirroring the BRL behavior:

```typescript
} else if (state.type === RampDirection.SELL && quote.outputCurrency === FiatToken.EURC) {
  return "distributeFees";
}
```

Also consider replacing the default `else → "moonbeamToPendulum"` with an unrecoverable error for unrecognized SELL combinations, so future corridor additions fail loudly instead of silently falling through.

---

### F-070: `MYKOBO_BASE_URL` Accepts Any Scheme — No HTTPS Enforcement

| Field | Value |
|---|---|
| **Severity** | 🟡 **Medium** |
| **Location** | `packages/shared/src/services/mykobo/mykoboApiService.ts` (constructor, lines 47-53) |
| **Spec** | `05-integrations/mykobo.md` (Invariant: HTTPS enforced for all Mykobo API calls) |
| **Status** | ✅ **FIXED** (2026-05-22) |
| **Found** | Mykobo integration audit, 2026-05-22 |
| **Impact** | A misconfigured `MYKOBO_BASE_URL` (e.g., `http://...` instead of `https://...`) will silently transmit bearer tokens, KYC document references, and IBAN payment instructions over cleartext. There is no startup or runtime check that rejects non-HTTPS base URLs. |
| **Resolution** | `assertSecureMykoboBaseUrl` helper added; called from constructor. Throws on any non-HTTPS scheme. Exception: when `NODE_ENV !== "production"`, `http://localhost` and `http://127.0.0.1` are permitted for local development. |

**Description:** The `MykoboApiService` constructor performs only path-shape normalization on the base URL:

```typescript
if (!MYKOBO_BASE_URL) {
  throw new Error("MYKOBO_BASE_URL not defined");
}
const trimmedBase = MYKOBO_BASE_URL.replace(/\/$/, "");
this.baseUrl = /\/v\d+$/.test(trimmedBase) ? trimmedBase : `${trimmedBase}/v1`;
```

No `new URL(...).protocol === "https:"` check. An operator with shell access to env vars (or a misconfigured deployment) could set `MYKOBO_BASE_URL=http://mykobo.example` and the service would silently use cleartext for all `/auth/token`, `/auth/refresh`, intent creation, and payout polling calls. This contradicts the audit-results PASS for "HTTPS enforced" (currently marked PASS for Mykobo on the strength of constructor normalization alone, which does not in fact enforce HTTPS).

**Fix:** Add an explicit scheme check at construction time:

```typescript
const parsed = new URL(trimmedBase);
if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") {
  throw new Error("MYKOBO_BASE_URL must use HTTPS in production");
}
```

For local development, allow `http://localhost` via an explicit allowlist. Also document the requirement in `.env.example`.

---

### F-071: Concurrent-401 Race in `MykoboApiService.handleAuthFailure`

| Field | Value |
|---|---|
| **Severity** | 🔵 **Low** |
| **Location** | `packages/shared/src/services/mykobo/mykoboApiService.ts` (`handleAuthFailure`, lines 109-122; `getToken`, lines 96-107) |
| **Spec** | `05-integrations/mykobo.md` (Invariant 14: Bearer-token refresh debounced) |
| **Status** | ✅ **FIXED** (2026-05-22) |
| **Found** | Mykobo integration audit, 2026-05-22 |
| **Impact** | Under concurrent load, multiple in-flight requests that each receive HTTP 401 will each independently call `handleAuthFailure()`, causing concurrent `refresh` / `acquireToken` calls to Mykobo. This is a "thundering herd" mini-race: it does not corrupt state, but it can produce redundant token rotations, brief windows where `this.cachedToken` is overwritten by a stale value, and unnecessary Mykobo `/auth/refresh` traffic that can itself trip Mykobo-side rate limiting. |
| **Resolution** | `authFailurePromise` debounce added, mirroring the existing `tokenPromise` pattern in `getToken`. Concurrent 401s now share a single in-flight refresh/re-acquire; the actual logic moved to `doHandleAuthFailure`. |

**Description:** The happy-path token acquisition in `getToken()` is correctly debounced via `this.tokenPromise`:

```typescript
if (!this.tokenPromise) {
  this.tokenPromise = this.acquireToken().finally(() => {
    this.tokenPromise = undefined;
  });
}
this.cachedToken = await this.tokenPromise;
```

But the 401-recovery path in `handleAuthFailure()` has no equivalent guard:

```typescript
private async handleAuthFailure(): Promise<string> {
  if (this.cachedToken) {
    try {
      const refreshed = await this.refreshAccessToken(this.cachedToken.refreshToken);
      this.cachedToken = refreshed;
      return refreshed.token;
    } catch (error) {
      logger.current.warn("Mykobo refresh failed; re-acquiring token", error);
    }
  }
  const reAcquired = await this.acquireToken();
  this.cachedToken = reAcquired;
  return reAcquired.token;
}
```

If two requests race and both receive 401, they both enter `handleAuthFailure()` and both fire `refreshAccessToken` (or `acquireToken`) concurrently. Each then independently assigns to `this.cachedToken`, so the second write clobbers the first. The first caller may receive a token that is immediately replaced.

**Mitigating factor:** The Mykobo handlers run inside the phase processor, which is single-threaded per ramp; the practical concurrency surface today is small (e.g., poll loops overlapping with `getProfile` calls from the HTTP layer). But the spec invariant ("Bearer-token refresh debounced — no thundering-herd on 401") is currently held only on the cold-start path.

**Fix:** Apply the same `tokenPromise` debounce pattern to `handleAuthFailure`:

```typescript
private authFailurePromise: Promise<string> | undefined;

private async handleAuthFailure(): Promise<string> {
  if (!this.authFailurePromise) {
    this.authFailurePromise = this.doHandleAuthFailure().finally(() => {
      this.authFailurePromise = undefined;
    });
  }
  return this.authFailurePromise;
}
```

Move the existing body of `handleAuthFailure` into `doHandleAuthFailure`.

---

### F-072: Ephemeral Account Freshness Not Validated at Ramp Registration

| Field | Value |
|---|---|
| **Severity** | 🟡 **Medium** |
| **Location** | `apps/api/src/api/services/ramp/ramp.service.ts` (`registerRamp` → `normalizeAndValidateSigningAccounts`, lines 141-216) |
| **Spec** | `02-signing-keys/ephemeral-accounts.md`, `03-ramp-engine/transaction-validation.md` |
| **Status** | ✅ **FIXED** |
| **Found** | Fresh audit pass, ephemeral lifecycle review |
| **Impact** | An API client could submit an ephemeral address that has already been used on one or more route-relevant chains (non-zero nonce, existing balance, or pre-existing Stellar account). The backend would build presigned transactions assuming nonce 0 / fresh account; mid-ramp execution would then halt with nonce mismatches, "account already exists" errors, or unexpected leftover balances, leaving subsidies/funding spent and ramps stuck. |

**Description:** `normalizeAndValidateSigningAccounts` only validated the *format* of each provided ephemeral address (StrKey, SS58, EVM `isAddress`). It did not verify that the addresses were actually fresh on the chains the ramp would touch. Because the SDK generates ephemerals client-side and the API trusts whatever address is submitted, a buggy or malicious client could replay an old ephemeral address. Stellar is especially sensitive: the server's first action is to *create* the Stellar account on-chain with a 2-of-2 multisig and starting balance — if the account already exists, that creation operation fails and the ramp cannot proceed.

**Fix:** Added `validateEphemeralAccountsFresh()` (`apps/api/src/api/services/ramp/ephemeral-freshness.ts`), invoked in `registerRamp` immediately after `normalizeAndValidateSigningAccounts`. The validator:

1. **Checks every supported chain of each submitted ephemeral type unconditionally** — rather than deriving a route-relevant subset from the quote. Supported sets: Substrate = `[pendulum, hydration, assethub]`; EVM = all configured EVM networks including Moonbeam (`SUPPORTED_EVM_NETWORKS`); Stellar = single Horizon check. This is intentionally wider than strictly required so that a future phase-handler addition cannot silently reopen the freshness gap by routing through a chain not covered by a route-derived mapping.
2. **Substrate**: queries `system.account(address)` on each supported chain; requires `nonce === 0` AND `free === 0`.
3. **EVM**: queries `getTransactionCount(address)` on each supported chain; requires `nonce === 0`.
4. **Stellar**: calls `loadAccountWithRetry(address)` against Horizon; requires the account to **not exist** (the server creates and funds it during the ramp).
5. **Fail-closed**: any RPC error rejects the registration with `SERVICE_UNAVAILABLE` rather than allowing freshness to be presumed.
6. Scope: `registerRamp` only. `updateRamp` does not re-check, since the ephemeral identity is bound to ramp state at registration time.

If the platform adds a new chain an ephemeral can ever sign on, `SUPPORTED_SUBSTRATE_NETWORKS` / `SUPPORTED_EVM_NETWORKS` MUST be updated, otherwise the freshness check leaves that chain unverified.

---

## Additional Observations (Not Findings)

These are design observations noted during spec writing that may warrant review but aren't direct vulnerabilities:

| ID | Observation | Spec |
|---|---|---|
| O-1 | Rebalancer hardcoded `brlaBusinessAccountAddress` default (`0xDF5Fb...08b2`) | `07-operations/rebalancer.md` |
| O-2 | Rebalancer 5% slippage tolerance on Nabla swap | `07-operations/rebalancer.md` |
| O-3 | Rebalancer `gasMultiplier * 5n` on SquidRouter transactions | `07-operations/rebalancer.md` |
| O-4 | Hand-written validators (no Zod/Joi) across all 27 endpoints | `07-operations/api-surface.md` |
| O-5 | `SUPABASE_SERVICE_KEY` used for all DB operations (no least-privilege) | `07-operations/secret-management.md` |
| O-6 | No per-endpoint rate limiting — all endpoints share 100 req/min | `07-operations/api-surface.md` |
| O-7 | `minDynamicDifference` has no DB CHECK constraint — can go negative | `03-ramp-engine/quote-lifecycle.md` |
| O-8 | Quote expiry hardcoded to 10 min — not configurable via env var | `03-ramp-engine/quote-lifecycle.md` |
| O-9 | Subsidize REST endpoints (`/v1/subsidize/preswap`, `/v1/subsidize/postswap`) exist in `subsidize.route.ts` but are **not mounted** in the v1 router — dead code that should be removed | `07-operations/api-surface.md` |
| O-10 | Ephemeral keys are not zeroed from JS memory after signing — they remain until garbage collected | `02-signing-keys/ephemeral-accounts.md` |
| O-11 | AlfredPay KYC callback endpoints (`kycRedirectOpened`, `kycRedirectFinished`) have `requireAuth` but no dedicated AlfredPay signature verification — relies solely on user session auth | `05-integrations/alfredpay.md` |
