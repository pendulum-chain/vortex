# Audit Findings Tracker

> **Generated:** 2026-04-02 | **Last Updated:** 2026-04-07 | **Status:** Implementation phase complete — 26 fixed, 4 accepted risk, 7 deferred

This file consolidates all security findings from the Vortex platform audit. Findings were discovered across two phases: specification writing (F-001 through F-012) and code-vs-spec audit across all 8 modules (F-013 through F-037).

## Summary

| Severity | Fixed | Accepted | Deferred | Total |
|---|---|---|---|---|
| 🔴 Critical | 3 | 0 | **0** | 3 |
| 🟠 High | 3 | 2 | **3** | 8 |
| 🟡 Medium | 12 | 2 | **4** | 18 |
| 🔵 Low / ⚪ Info | 8 | 0 | **0** | 8 |
| **Total** | **26** | **4** | **7** | **37** |

> **Fixed** = code change implemented and verified. **Accepted** = CTO reviewed and accepted risk, no code change. **Deferred** = requires architectural work, separate app changes, or future investigation.

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
| **Spec** | `00-system-overview/architecture.md` |
| **Status** | ✅ **FIXED** (legacy endpoints removed, auth added per CTO decisions) |
| **Found** | Code audit, iteration 2 |
| **Impact** | Attacker can start ramps, trigger XCM execution, fund ephemeral accounts, and initiate subsidization — all spending platform funds — without any authentication. |

**Description:** The following endpoints have **zero authentication middleware**:

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

**CTO Clarification (2026-04-02):**
- `/pendulum/fundEphemeral`, `/moonbeam/execute-xcm`, `/subsidize/preswap`, `/subsidize/postswap` are **legacy endpoints that should be removed**. They were from a time when the frontend managed ramp progression directly. The server now handles this internally.
- `/ramp/start` and `/ramp/update` must remain **unauthenticated for now** (backwards compatibility with existing SDK users who haven't implemented auth yet). Auth will be added in a future iteration once all SDK consumers are notified.
- `/stellar/create` — **add auth** (requireAuth or apiKeyAuth).
- `/maintenance/schedules/:id/active` — **add adminAuth**.
- `/webhook` POST/DELETE — **add apiKeyAuth** (partners register webhooks).
- `/brla/getUser`, `/brla/getUserRemainingLimit` — **add requireAuth** (user data must require authenticated session).
- The API is **directly exposed to the internet** with no reverse proxy or firewall restricting endpoint access.

**Fix:**
1. **Remove** legacy endpoints: `/pendulum/fundEphemeral`, `/moonbeam/execute-xcm`, `/subsidize/preswap`, `/subsidize/postswap`
2. **Add auth middleware**: `requireAuth` to `/stellar/create` and `/brla/*` user data endpoints; `adminAuth` to `/maintenance/*`; `apiKeyAuth` to `/webhook` POST/DELETE
3. **Document** that `/ramp/start` and `/ramp/update` are intentionally unauthenticated (temporary, backwards compat) with a TODO to add API key auth once SDK users migrate
4. **Future:** Require API key auth on `/ramp/start` and `/ramp/update`

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

**Description:** Of 16+ `fetch()` calls to external services, only `webhook-delivery.service.ts` uses `AbortController` with a timeout. All others (Monerium, CoinGecko, Moonpay, Transak, AlchemyPay, Subscan, Slack, ramp helpers) make HTTP requests without any timeout or `AbortSignal`.

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

### F-023: Monerium SEPA Timeout May Be Too Short

| Field | Value |
|---|---|
| **Location** | `apps/api/src/api/services/phases/handlers/monerium-onramp-mint-handler.ts` |
| **Spec** | `05-integrations/monerium.md` |
| **Status** | 🟡 **DEFERRED** — needs runtime testing to validate |
| **Found** | Code audit, iteration 2, Module 05 |
| **Impact** | Legitimate SEPA on-ramp payments could be marked as failed if Monerium takes longer than 30 minutes to mint EURe after SEPA settlement. |

**Description:** The `monerium-onramp-mint-handler.ts` uses `PAYMENT_TIMEOUT_MS` (30 minutes) to wait for EURe token arrival on Polygon. SEPA transfers take 1-3 business days to settle. The 30-minute timeout may be too short if Monerium's processing itself takes time after SEPA arrives.

**CTO Clarification (2026-04-02):** The timer starts at ramp creation — NOT after Monerium confirms SEPA settlement. The flow works because the ramp isn't created until the SEPA transfer is expected to have already settled and Monerium is expected to mint EURe imminently. However, if Monerium processing is delayed beyond 30 minutes after the ramp is created, the ramp will fail even if the payment was legitimate.

**Fix:** Verify that the 30-minute window is sufficient for the expected Monerium processing time after SEPA settlement. If not, extend the timeout or implement a webhook-based flow where Monerium notifies completion rather than polling.

---

### F-024: No Concurrent SEPA Ramp Limit Per User

| Field | Value |
|---|---|
| **Location** | Ramp creation flow (no per-user limit enforcement) |
| **Spec** | `05-integrations/monerium.md` |
| **Status** | 🟡 **DEFERRED** — requires new DB queries and ramp creation changes |
| **Found** | Code audit, iteration 2, Module 05 |
| **Impact** | Resource exhaustion — an attacker could create many SEPA-based ramps without paying, tying up system resources (polling, state tracking, phase processing). |

**Description:** No per-user concurrent ramp limit is enforced for Monerium SEPA flows. A user can create unlimited pending SEPA ramps. Each ramp consumes: (1) a database row with state tracking, (2) periodic phase processing cycles (polling for token arrival), (3) a slot in the phase processor queue. The 30-minute timeout per ramp partially mitigates this (each ramp auto-fails after 30 min), but during those 30 minutes the system is actively polling for each ramp.

**CTO Clarification (2026-04-02):** Yes, add a per-user limit on concurrent pending SEPA ramps. Suggested max: 3.

**Fix:** Add a per-user limit on concurrent pending ramps (e.g., max 3 pending SEPA ramps per user). Enforce at ramp creation time.

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
