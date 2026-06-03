# Rebalancer

## What This Does

The rebalancer is a standalone service (`apps/rebalancer/`) that monitors token coverage ratios and automatically moves liquidity across chains when ratios fall below threshold. Its primary function is ensuring the platform has sufficient tokens to service ramp operations without manual intervention.

**Current implementation:** Two rebalancing paths:

1. **BRLA ↔ axlUSDC (legacy, Pendulum)** — 8-step cross-chain process on Pendulum/Moonbeam/Polygon. Activated via `--legacy` flag.
2. **USDC → BRLA → USDC (Base)** — Default flow. Multi-step process on Base with dual-route optimization (SquidRouter vs Avenia).

**Architecture:**
- `index.ts` — Entry point: parses CLI args (`--legacy`, `--restart`, `--route=`, amount), checks coverage ratios, selects flow
- `rebalance/brla-to-axlusdc/index.ts` — Legacy orchestrator: 8-step state machine on Pendulum
- `rebalance/brla-to-axlusdc/steps.ts` — Legacy step implementations
- `rebalance/usdc-brla-usdc-base/index.ts` — Base orchestrator: multi-step state machine with dual-route branching
- `rebalance/usdc-brla-usdc-base/steps.ts` — Base step implementations (Nabla swap, Avenia transfers, SquidRouter, rate comparison)
- `services/stateManager.ts` — Generic `StateManager<T>` base class + flow-specific managers (`BrlaToAxlUsdcStateManager`, `UsdcBaseStateManager`)
- `services/indexer/index.ts` — Nabla coverage ratio queries (Pendulum via GraphQL, Base via on-chain reads)
- `utils/config.ts` — Configuration and secret loading
- `utils/nonce.ts` — `NonceManager` for sequential EVM transaction nonces
- `utils/transactions.ts` — Transaction confirmation helpers

**CLI interface:**
```
bun run start [amount] [--legacy] [--restart] [--route=squidrouter|avenia]
```
- No flag → Base flow (default)
- `--legacy` → Pendulum flow
- `--restart` → Force fresh state, ignore in-progress rebalance
- `--route=` → Force specific route (skip rate comparison)

---

### Flow 1: BRLA → axlUSDC (Legacy, Pendulum)

**Rebalancing flow:**
1. Swap axlUSDC → BRLA on Pendulum (Nabla DEX)
2. XCM BRLA from Pendulum → Moonbeam
3. Call BRLA API to swap BRLA → USDC (off-chain settlement via BRLA provider)
4. Wait for USDC arrival on Polygon
5. SquidRouter swap: USDC on Polygon → axlUSDC on Moonbeam
6. XCM axlUSDC from Moonbeam → Pendulum
7. Verify arrival on Pendulum
8. Clean up state

**Key secrets:** `PENDULUM_ACCOUNT_SECRET` (sr25519), `EVM_ACCOUNT_SECRET` (mnemonic for Moonbeam + Polygon). These are **distinct from the API service keys** — the rebalancer operates its own accounts.

---

### Flow 2: USDC → BRLA → USDC (Base, default)

**Trigger condition:** Base Nabla BRLA pool coverage ratio ≥ `1 + rebalancingThreshold` (default 1.25).

**Daily bridge limit:** Total USDC bridged per calendar day (UTC) must not exceed `REBALANCING_DAILY_BRIDGE_LIMIT_USD` (default 10,000). Checked against `UsdcBaseStateManager` history before starting.

**Rebalancing flow (linear phase):**
1. Check initial USDC balance on Base (sufficient for requested amount)
2. Nabla approve + swap: USDC → BRLA on Base
3. Transfer BRLA to Avenia business account on Base (ERC-20 transfer)
4. Wait for BRLA to appear on Avenia internal balance (polling, 10-min timeout)

**Rate comparison phase:**
5. Compare rates between SquidRouter and Avenia for BRLA → USDC conversion
   - If `--route=` specified, fetches quote for that route only
   - If both quotes fail, aborts
   - If one fails, uses the other

**Route A: Avenia (BRLA → USDC on Base, direct):**
6a. Create Avenia swap ticket (BRLA → USDC, output on Base)
7a. Poll ticket status until PAID (5-min timeout)
8a. Wait for USDC arrival on Base (balance polling, 30-min timeout)

**Route B: SquidRouter (BRLA on Polygon → USDC on Base, cross-chain):**
6b. Request Avenia to transfer BRLA from internal balance to Polygon
7b. Poll ticket status until PAID (5-min timeout)
8b. Wait for BRLA arrival on Polygon (balance polling, 10-min timeout)
9b. SquidRouter approve + swap: BRLA on Polygon → USDC on Base
10b. Wait for Axelar cross-chain execution (30-min timeout)
11b. Wait for USDC arrival on Base (balance polling, 30-min timeout)

**Verification:**
12. Verify final USDC balance on Base
13. Record history entry (amount, cost, cost-relative, timestamps)
14. Send Slack notification with route, amount, and cost metrics

**Fallback:** If Avenia ticket creation fails during Route A, the flow falls back to Route B (SquidRouter).

**Key secrets:** `EVM_ACCOUNT_SECRET` (single BIP-39 mnemonic, derives accounts for Base + Polygon). `PENDULUM_ACCOUNT_SECRET` not required for this flow.

## Security Invariants

### Shared (both flows)

1. **Coverage ratio check MUST precede rebalancing** — The rebalancer only triggers when a token's coverage ratio falls below threshold. It must never rebalance preemptively or based on stale data. Legacy flow uses Pendulum indexer (GraphQL); Base flow uses on-chain Nabla contract reads.
2. **State persistence MUST survive process restarts** — Each flow has its own Supabase Storage JSON file (`rebalancer_state.json` for legacy, `rebalancer_state_usdc_base.json` for Base). On restart, the rebalancer reads the file and resumes from the last completed phase.
3. **Each phase MUST be idempotent or guarded against re-execution** — If the process crashes mid-phase and resumes, re-executing a completed phase must not cause double-swaps, double-transfers, or double-settlements. Transaction hashes are stored in state to detect already-completed phases.
4. **Rebalancer private keys MUST be isolated from API service keys** — The rebalancer keys operate separate accounts. Compromise of rebalancer keys should not affect API ramp operations, and vice versa.
5. **BRLA business account address MUST be verified** — `brlaBusinessAccountAddress` has a hardcoded default (`0xDF5Fb34B90e5FDF612372dA0c774A516bF5F08b2`). If this address is wrong, funds are sent to the wrong recipient with no recovery.
6. **Concurrent rebalancer executions MUST NOT corrupt state** — If two rebalancer instances run simultaneously, both would read the same state file and potentially execute the same phases in parallel. Supabase Storage has no file locking or atomic compare-and-swap.

### Legacy flow (BRLA ↔ axlUSDC) invariants

7. **Slippage MUST be bounded** — The Nabla swap step uses a 5% slippage tolerance (hardcoded). Excessive slippage could result in significant value loss per rebalance.
8. **SquidRouter gas pricing MUST not overpay excessively** — `gasMultiplier * 5n` is applied to `maxFeePerGas` for SquidRouter transactions. This aggressive multiplier ensures inclusion but could result in significant gas overpayment.
9. **Axelar polling MUST have a timeout** — **F-034 (legacy):** The legacy flow's Axelar polling loop (`while (!isExecuted)`) has no timeout — it will poll indefinitely if Axelar never reports success. This is a known deficiency in the legacy flow; the Base flow fixes it with a 30-minute timeout.

### Base flow (USDC → BRLA → USDC) invariants

10. **Daily bridge limit MUST be enforced** — Total USDC bridged per calendar day (UTC) must not exceed `REBALANCING_DAILY_BRIDGE_LIMIT_USD`. Checked against `UsdcBaseStateManager` history entries before starting a new rebalance. Prevents runaway rebalancing from draining hot wallets.
11. **Rate comparison MUST handle provider failures gracefully** — If both SquidRouter and Avenia quotes fail, the rebalancer MUST abort (not proceed with zero information). If one fails, the other is used. If `--route=` is specified, only that route's quote is fetched.
12. **Avenia fallback to SquidRouter MUST be atomic in state** — If Avenia ticket creation fails, the flow sets `winningRoute = "squidrouter"` and `currentPhase = AveniaTransferToPolygon` in a single `saveState()` call. A crash between the failure and the save could leave the flow in an inconsistent state.
13. **NonceManager MUST be re-initialized on resume** — The `NonceManager` is created fresh at the start of each execution from `getTransactionCount()`. On resume, it must not reuse stale nonces from a previous execution.
14. **Axelar cross-chain execution MUST have a timeout** — SquidRouter's Axelar polling has a 30-minute timeout. If Axelar does not confirm execution within this window, the flow MUST throw (not poll indefinitely). This resolves F-034 for the Base flow.
15. **BRLA balance arrival check MUST use a tolerance** — `waitForBrlaOnAvenia` checks if the Avenia balance is ≥ 99.8% of the expected amount (`balanceDecimal.div(brlaAmountDecimal).gte(0.998)`). This accounts for rounding and minor fee deductions without rejecting valid arrivals.
16. **`EVM_ACCOUNT_SECRET` derives the same address on all EVM chains** — A single BIP-39 mnemonic is used for Base and Polygon. This means compromise of this one secret drains the rebalancer on ALL EVM chains. The legacy flow's separate-key model had narrower blast radius per key.

## Threat Vectors & Mitigations

### Shared threats

| Threat | Mitigation |
|---|---|
| **⚠️ State file corruption from concurrent execution** — Two rebalancer instances read the same JSON file from Supabase Storage, both decide to rebalance, both execute phases simultaneously | **NO MITIGATION.** Supabase Storage has no file locking, no atomic compare-and-swap, no conditional writes. If the rebalancer is deployed as multiple instances or triggered concurrently, state corruption and double-execution are possible. |
| **Rebalancer key compromise** — Attacker obtains the rebalancer private key(s) | Full drain of the rebalancer's accounts on all affected chains. Legacy: three separate keys (Pendulum, Moonbeam, Polygon) — compromise of one drains one chain. Base: single `EVM_ACCOUNT_SECRET` mnemonic — compromise drains both Base and Polygon. The API service accounts are separate, so ramp operations are not directly affected (but liquidity would be depleted). |
| **Hardcoded business account address** — `brlaBusinessAccountAddress` default is wrong or points to an attacker-controlled address | Funds would be sent to the wrong address. The address should be verified against BRLA's official documentation and set via environment variable, not hardcoded. |
| **State file deletion or corruption** — Supabase Storage file is deleted or corrupted manually | The rebalancer would lose track of in-progress operations. Phases that already executed (swaps, transfers) would not be resumed, and the rebalancer would start fresh. This could leave funds stranded mid-flow. |
| **Stale coverage ratio** — The coverage ratio is checked once at startup, but by the time the multi-step rebalance completes, the ratio may have changed significantly | No re-check between phases. The rebalance amount is calculated upfront. If conditions change during the multi-step process, the rebalance may be unnecessary or insufficient. |

### Legacy flow threats

| Threat | Mitigation |
|---|---|
| **BRLA API manipulation** — The BRLA API returns a manipulated exchange rate for the BRLA→USDC swap | The rebalancer trusts the BRLA API response. No independent price verification is performed. A manipulated rate could result in receiving far less USDC than the BRLA value. |
| **SquidRouter route manipulation** — SquidRouter API returns a malicious route for the USDC→axlUSDC swap | Same trust issue as with the BRLA API. The rebalancer trusts the route. No output verification against expected amounts. |
| **5% slippage exploitation** — An attacker manipulates the Nabla DEX pool to extract up to 5% per rebalance via sandwich attacks | 5% slippage tolerance is generous. For large rebalancing amounts, this could be significant. No MEV protection on Pendulum (though parachain MEV is less prevalent than Ethereum). |
| **Infinite Axelar polling (F-034)** — Legacy flow's Axelar polling has no timeout; if Axelar never reports success, the process hangs indefinitely | **NO MITIGATION in legacy flow.** The process will hang until manually killed or the OS reclaims resources. The Base flow resolves this with a 30-minute timeout. |

### Base flow threats

| Threat | Mitigation |
|---|---|
| **Rate comparison manipulation** — Both Avenia and SquidRouter quotes are fetched and compared; an attacker could manipulate one provider's rate to force the other route | The rebalancer trusts both providers' quotes without independent verification. However, since both routes end with USDC on Base, the worst case is choosing a slightly worse rate, not fund loss. The `slippage: 4` parameter on SquidRouter provides some buffer. |
| **Avenia ticket creation failure mid-flow** — Avenia API fails after the flow committed to the Avenia route | **Mitigated.** The flow catches the error and falls back to SquidRouter by setting `winningRoute = "squidrouter"` and saving state. If the crash happens between the error and the `saveState()`, the flow would retry the Avenia route on resume (benign — creates another ticket, wastes a quote). |
| **Daily bridge limit bypass** — History entries are stored in Supabase Storage; an attacker who can modify the storage could clear history to bypass the daily limit | **Weak mitigation.** The limit is enforced client-side by reading history from Supabase. An attacker with Supabase access could also drain funds directly, so the limit bypass is a secondary concern. |
| **NonceManager stale nonce** — If the process crashes after sending a transaction but before saving the nonce, the resumed execution could reuse the same nonce | **Mitigated.** `NonceManager` is re-initialized from `getTransactionCount()` on each execution. The stored transaction hashes in state also prevent re-execution of already-completed phases. |
| **`EVM_ACCOUNT_SECRET` single-key blast radius** — One mnemonic controls all EVM chain accounts for the rebalancer | Compromise of this one secret drains rebalancer funds on Base AND Polygon. The legacy flow's three separate keys had narrower per-key blast radius. This is a deliberate simplification accepted for operational convenience. |
| **SquidRouter cross-chain timeout** — Axelar cross-chain execution could take longer than 30 minutes during network congestion | The rebalancer throws on timeout, leaving the BRLA-to-USDC swap incomplete on Polygon. Funds would be stuck as BRLA on Polygon until manual intervention or the next rebalance attempt resumes from the `SquidRouterApproveAndSwap` phase. |
| **BRLA balance tolerance (99.8%)** — `waitForBrlaOnAvenia` accepts 99.8% of expected amount as sufficient | If Avenia deducts a fee > 0.2%, the flow proceeds with slightly less BRLA than expected. The downstream rate comparison and swap would still work, but the final USDC amount would be slightly less than quoted. |

## Audit Checklist

### Shared

- [x] **FINDING**: State stored as JSON file in Supabase Storage — no locking, no atomic updates. Verify whether concurrent rebalancer instances are possible in the deployment configuration. **PASS (confirmed limitation)** — rebalancer is a one-shot CLI process (`process.exit(0/1)`); concurrency depends entirely on deployment scheduling (cron). No in-code concurrency guard.
- [PARTIAL] **FINDING**: `brlaBusinessAccountAddress` has hardcoded default `0xDF5Fb34B90e5FDF612372dA0c774A516bF5F08b2` — verify this is the correct BRLA business account and that it's set via environment variable in production. **PARTIAL** — address is overridable via env var but has hardcoded default; correctness of default requires external verification.
- [x] Verify Supabase Storage write errors are handled — what happens if state cannot be persisted after a phase completes? **PASS** — errors propagate and cause process exit; no silent data loss.
- [PARTIAL] Verify the rebalancer has monitoring/alerting for: failed phases, insufficient balances, stuck state. **PARTIAL** — `process.exit(1)` on failure provides signal for external monitoring, but no built-in alerting. Slack notifications on completion provide some visibility.
- [x] Verify no rebalancer secrets are logged (check all error handlers and debug logging). **PASS** — no secret logging found.
- [x] Check whether the rebalancer runs on a schedule (cron) or is triggered manually — determines concurrency risk. **PASS** — one-shot CLI process; concurrency controlled by external scheduler.
- [x] Verify the `StateManager<T>` handles missing or corrupted state files gracefully (fresh start vs crash). **PASS** — missing state treated as fresh start; `upsert: true` for writes; invalid JSON treated as missing with console warning.

### Legacy flow (BRLA ↔ axlUSDC)

- [x] **FINDING**: 5% slippage tolerance hardcoded in Nabla swap — verify this is acceptable for expected rebalancing amounts. **PASS (confirmed limitation)** — 5% is generous but acceptable for the current rebalancing volumes; documented as known risk.
- [x] **FINDING**: `gasMultiplier * 5n` applied to `maxFeePerGas` — verify this doesn't cause excessive gas overpayment in production. **PASS (confirmed limitation)** — aggressive multiplier ensures inclusion; overpayment risk accepted for reliability.
- [x] Verify `COVERAGE_RATIO_THRESHOLD` default (0.25) is appropriate for the expected token volumes. **PASS** — 25% threshold reasonable for current volumes.
- [x] Verify the rebalancer private keys are distinct from all API service keys. **PASS** — separate env vars and accounts confirmed.
- [PARTIAL] Verify step idempotency: can each of the 8 steps be safely re-executed after a crash? Check for nonce guards, balance checks, or transaction hash verification. **PARTIAL F-033** — steps 2, 3, 5, 6, 7 are NOT idempotent; crash between step execution and `saveState()` causes double-spend risk.
- [PARTIAL] Verify the BRLA→USDC swap (step 3) validates the received USDC amount against expectations. **PARTIAL** — BRLA API response is trusted; no independent amount verification.
- [FAIL] Verify the SquidRouter swap (step 5) validates the received axlUSDC amount against expectations. **FAIL F-034** — no output amount validation AND Axelar status polling has no timeout; infinite loop risk if Axelar never reports success.

### Base flow (USDC → BRLA → USDC)

- [x] **FINDING**: Axelar polling has 30-minute timeout — resolves F-034 for Base flow. **PASS** — `axelarTimeout = 30 * 60 * 1000` enforced in `squidRouterApproveAndSwap()`.
- [x] **FINDING**: Daily bridge limit check — `REBALANCING_DAILY_BRIDGE_LIMIT_USD` (default 10,000) enforced against history. **PASS** — checked before starting new rebalance; prevents runaway bridging.
- [x] **FINDING**: Avenia fallback to SquidRouter — if Avenia ticket creation fails, flow falls back to SquidRouter route. **PASS** — error caught, `winningRoute` updated, state saved atomically.
- [x] **FINDING**: `EVM_ACCOUNT_SECRET` single mnemonic for all EVM chains — broader blast radius than legacy three-key model. **PASS (accepted)** — deliberate simplification; documented in invariants.
- [x] Verify rate comparison handles partial failures — what happens if one provider's quote fails? **PASS** — if both fail, throws; if one fails, uses the other; if `--route=` specified, only fetches that quote.
- [x] Verify NonceManager re-initialization on resume — does it fetch fresh nonce from chain? **PASS** — `NonceManager.create()` calls `getTransactionCount()` on each execution.
- [x] Verify BRLA balance arrival tolerance (99.8%) is appropriate. **PASS** — accounts for rounding and minor fee deductions; 0.2% tolerance is tight enough to reject significant shortfalls.
- [x] Verify `checkTicketStatusPaid` has a timeout (not infinite polling). **PASS** — 5-minute timeout with 5-second poll interval.
- [x] Verify `waitForBrlaOnAvenia` has a timeout. **PASS** — 10-minute timeout with 5-second poll interval.
- [x] Verify `waitUsdcOnBase` has a timeout. **PASS** — 30-minute timeout via `checkEvmBalancePeriodically`.
- [x] Verify `waitBrlaOnPolygon` has a timeout. **PASS** — 10-minute timeout via `checkEvmBalancePeriodically`.
- [PARTIAL] Verify the Nabla swap validates output amount against expectations. **PARTIAL** — uses `AMM_MINIMUM_OUTPUT_HARD_MARGIN` (5%) for slippage protection via `quoteSwapExactTokensForTokens`, but post-swap balance is verified by comparing pre/post BRLA balance (not against the quote). A sandwich attack could extract up to 5%.
- [x] Verify the `usdcBasePhaseOrder` overlap (AveniaTransferToPolygon and AveniaSwapToUsdcBase both at order 7) cannot cause incorrect phase transitions. **PASS** — routes are mutually exclusive, guarded by `if (state.winningRoute === "avenia")` / `if (state.winningRoute === "squidrouter")` checks.
- [x] Verify `NablaSwap` phase in enum is not reachable (dead code). **PASS** — `NablaSwap` exists in enum but orchestrator transitions from `NablaApprove` directly to `TransferBrlaToAvenia`. Benign — no security impact, but should be cleaned up.
- [x] Verify `aveniaQuoteToken` state field is not used. **PASS** — always `null`, never written to. Benign dead state field.
