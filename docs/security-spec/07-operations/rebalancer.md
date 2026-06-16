# Rebalancer

## What This Does

The rebalancer is a standalone service (`apps/rebalancer/`) that monitors token coverage ratios and automatically moves liquidity across chains when ratios indicate a pool imbalance. Its primary function is ensuring the platform has sufficient tokens to service ramp operations without manual intervention.

The default Base rebalancer is cost-aware. A coverage-ratio breach makes a fresh cron run eligible for evaluation, but execution still depends on the configured urgency band and projected round-trip cost. Mild and moderate imbalances can be skipped when route quotes are unfavorable; severe imbalances tolerate higher configured cost. `REBALANCING_DAILY_BRIDGE_LIMIT_USD` and `REBALANCING_HARD_MAX_COST_BPS` remain hard caps in every mode.

**Current implementation:** Three rebalancing paths:

1. **BRLA ↔ axlUSDC (legacy, Pendulum)** — 8-step cross-chain process on Pendulum/Moonbeam/Polygon. Activated via `--legacy` flag.
2. **USDC → BRLA → USDC (Base)** — Default high-coverage flow. Multi-step process on Base with route optimization across SquidRouter, Avenia, and optional main Nabla.
3. **BRLA → USDC correction (Base)** — Default low-coverage flow. Base-only two-swap process that uses main Nabla for USDC→BRLA and the BRLA pool for BRLA→USDC.

**Architecture:**
- `index.ts` — Entry point: parses CLI args (`--legacy`, `--restart`, `--route=`, amount), checks coverage ratios, selects flow
- `rebalance/brla-to-axlusdc/index.ts` — Legacy orchestrator: 8-step state machine on Pendulum
- `rebalance/brla-to-axlusdc/steps.ts` — Legacy step implementations
- `rebalance/usdc-brla-usdc-base/index.ts` — Base high-coverage orchestrator: multi-step state machine with route branching
- `rebalance/usdc-brla-usdc-base/steps.ts` — Base high-coverage step implementations (Nabla swaps, Avenia transfers, SquidRouter, rate comparison)
- `rebalance/brla-to-usdc-base/index.ts` — Base low-coverage orchestrator: main Nabla + BRLA-pool two-swap correction
- `rebalance/brla-to-usdc-base/steps.ts` — Base low-coverage step implementations
- `services/stateManager.ts` — Generic `StateManager<T>` base class + flow-specific managers (`BrlaToAxlUsdcStateManager`, `UsdcBaseStateManager`, `BrlaToUsdcBaseStateManager`)
- `services/indexer/index.ts` — Nabla coverage ratio queries (Pendulum via GraphQL, Base via on-chain reads)
- `utils/config.ts` — Configuration and secret loading
- `utils/nonce.ts` — `NonceManager` for sequential EVM transaction nonces
- `utils/transactions.ts` — Transaction confirmation helpers

**CLI interface:**
```
bun run start [amount] [--legacy] [--restart] [--route=squidrouter|avenia|nabla-main]
```
- No flag → Base flow (default)
- `--legacy` → Pendulum flow
- `--restart` → Force fresh state, ignore in-progress rebalance
- `--route=squidrouter|avenia|nabla-main` → Constrain the high-coverage return route; the route is still quoted and cost-gated before execution

**Cost policy controls:**
- `REBALANCING_POLICY_MODE=auto|dry-run|off|always` — `auto` applies urgency-band cost gating; `dry-run` quotes and logs the decision without state writes or fund movement; `off` skips fresh Base rebalances; `always` bypasses per-band cost gating but still respects the daily bridge limit and hard max-cost cap.
- `REBALANCING_MODERATE_DEVIATION_BPS` / `REBALANCING_SEVERE_DEVIATION_BPS` — classify coverage deviation beyond the trigger bound into mild, moderate, or severe bands.
- `REBALANCING_MAX_COST_BPS_MILD` / `REBALANCING_MAX_COST_BPS_MODERATE` / `REBALANCING_MAX_COST_BPS_SEVERE` — maximum projected round-trip cost per urgency band.
- `REBALANCING_HARD_MAX_COST_BPS` — final projected-cost ceiling enforced even in `always` mode.

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

**Key secrets:** `PENDULUM_ACCOUNT_SECRET` (sr25519), `EVM_ACCOUNT_SECRET` (mnemonic for Moonbeam and Polygon). These are **distinct from the API service keys** — the rebalancer operates its own accounts.

---

### Flow 2: USDC → BRLA → USDC (Base, default high-coverage flow)

**Trigger condition:** Base Nabla BRLA pool coverage ratio > `1 + REBALANCING_THRESHOLD_USDC_TO_BRLA` (default upper bound `1.01`). Falls back to `REBALANCING_THRESHOLD` when the route-specific threshold is unset. This makes the flow eligible for evaluation; cost policy may still skip fresh execution.

**Daily bridge limit:** Total requested USDC amount recorded by Base-flow history per calendar day (UTC), including the amount about to be rebalanced, must not exceed `REBALANCING_DAILY_BRIDGE_LIMIT_USD` (default 10,000). Checked against both `UsdcBaseStateManager` and `BrlaToUsdcBaseStateManager` history before starting a fresh Base rebalance.

**Urgency-band policy:** Before any state write or transaction, the flow quotes the expected round-trip USDC output. Projected cost is `(input USDC - projected output USDC) / input USDC` in basis points. `auto` mode executes only when the projected cost is within the configured limit for the current coverage-deviation band. `dry-run` logs the same decision but never starts a rebalance. `off` skips without quoting. `always` can execute above the band limit, but not above `REBALANCING_HARD_MAX_COST_BPS` or the daily bridge limit.

**Rebalancing flow (linear phase):**
1. Check initial USDC balance on Base (sufficient for requested amount)
2. Nabla approve + swap: USDC → BRLA on Base
3. Transfer BRLA to Avenia business account on Base (ERC-20 transfer)
4. Wait for BRLA delta to appear on Avenia internal balance (polling, 10-min timeout)

**Rate comparison phase:**
5. Compare rates between SquidRouter, Avenia, and optional main Nabla for BRLA → USDC conversion
   - If `--route=` is specified, execution is constrained to that route and the policy still requires a quote for that route before any swap
   - Main Nabla route is available only when both `MAIN_NABLA_ROUTER` and `MAIN_NABLA_QUOTER` are set
   - If every enabled route quote fails, aborts
   - If one fails, uses the other
   - The selected quote feeds both route selection and the cost-policy gate before the first Nabla swap

**Route A: main Nabla (BRLA → USDC on Base, direct):**
6a. Main Nabla approve + swap: BRLA → USDC on Base
7a. Verify final USDC balance on Base

**Route B: Avenia (BRLA → USDC on Base, direct):**
6b. Transfer BRLA to Avenia business account on Base if not already transferred
7b. Create Avenia swap ticket (BRLA → USDC, output on Base)
8b. Poll ticket status until PAID (5-min timeout)
9b. Wait for USDC delta arrival on Base (balance polling, 30-min timeout)

**Route C: SquidRouter (BRLA on Polygon → USDC on Base, cross-chain):**
6c. Transfer BRLA to Avenia business account on Base if not already transferred
7c. Request Avenia to transfer BRLA from internal balance to Polygon
8c. Poll ticket status until PAID (5-min timeout)
9c. Wait for BRLA delta arrival on Polygon (balance polling, 10-min timeout)
10c. SquidRouter approve + swap: BRLA on Polygon → USDC on Base
11c. Wait for Axelar cross-chain execution (30-min timeout)
12c. Wait for USDC delta arrival on Base (balance polling, 30-min timeout)

**Verification:**
12. Verify final USDC balance on Base
13. Record history entry (amount, cost, cost-relative, timestamps)
14. Send Slack notification with route, amount, and cost metrics

**Fallback:** If Avenia ticket creation fails during Route A, the flow falls back to Route B (SquidRouter).

**Key secrets:** `EVM_ACCOUNT_SECRET` (single BIP-39 mnemonic, derives accounts for Base + Polygon). `PENDULUM_ACCOUNT_SECRET` not required for this flow.

---

### Flow 3: BRLA → USDC correction (Base, default low-coverage flow)

**Trigger condition:** Base Nabla BRLA pool coverage ratio < `1 - REBALANCING_THRESHOLD_BRLA_TO_USDC` (default lower bound `0.99`). Falls back to `REBALANCING_THRESHOLD` when the route-specific threshold is unset. This makes the flow eligible for evaluation; cost policy may still skip fresh execution.

**Daily bridge limit:** Uses the same Base-flow daily limit described above and records history in `rebalancer_state_brla_to_usdc_base.json`.

**Urgency-band policy:** Uses the same Base policy controls as the high-coverage flow. Before any state write or transaction, the rebalancer pre-quotes the main Nabla USDC→BRLA leg and the BRLA-pool BRLA→USDC leg, then applies the band-specific projected-cost threshold.

**Rebalancing flow:**
1. Check initial USDC balance on Base
2. Main Nabla swap: USDC → BRLA on Base
3. BRLA pool swap: BRLA → USDC on Base
4. Verify final USDC balance on Base
5. Record history entry and send Slack notification

**Key secrets:** `EVM_ACCOUNT_SECRET` for Base transactions. `PENDULUM_ACCOUNT_SECRET` is not required.

## Security Invariants

### Shared (both flows)

1. **Coverage ratio check MUST precede rebalancing** — The rebalancer only considers a fresh run when a flow-specific coverage threshold is crossed. Legacy flow uses Pendulum indexer data and triggers when BRLA is over-covered while USDC.axl is not; the default Base flow uses on-chain Nabla contract reads and becomes eligible above `1 + REBALANCING_THRESHOLD_USDC_TO_BRLA` or below `1 - REBALANCING_THRESHOLD_BRLA_TO_USDC`. For Base flows, threshold crossing is necessary but not sufficient: cost policy can still skip execution.
2. **State persistence MUST survive process restarts** — Each flow has its own Supabase Storage JSON file (`rebalancer_state.json` for legacy, `rebalancer_state_usdc_base.json` for Base high-coverage, `rebalancer_state_brla_to_usdc_base.json` for Base low-coverage). On restart, the rebalancer reads the file and resumes from the last completed phase.
3. **Each phase MUST be idempotent or guarded against re-execution** — If the process crashes mid-phase and resumes, re-executing a completed phase must not cause double-swaps, double-transfers, or double-settlements. Transaction hashes and pre-action balance baselines are stored in state to detect already-completed phases and verify per-run deltas.
4. **Rebalancer private keys MUST be isolated from API service keys** — The rebalancer keys operate separate accounts. Compromise of rebalancer keys should not affect API ramp operations, and vice versa.
5. **BRLA business account address MUST be verified** — `brlaBusinessAccountAddress` has a hardcoded default (`0xDF5Fb34B90e5FDF612372dA0c774A516bF5F08b2`). If this address is wrong, funds are sent to the wrong recipient with no recovery.
6. **Concurrent rebalancer executions MUST NOT corrupt state** — If two rebalancer instances run simultaneously, both would read the same state file and potentially execute the same phases in parallel. Supabase Storage has no file locking or atomic compare-and-swap.
7. **Policy modes MUST be fail-safe** — `off` performs no fresh Base rebalancing; `dry-run` performs read-only quote/evaluation/logging with no state writes, tickets, approvals, swaps, transfers, or history entries; `always` bypasses per-band cost gating only, not the daily bridge limit or hard max-cost cap.

### Legacy flow (BRLA ↔ axlUSDC) invariants

8. **Slippage MUST be bounded** — The Nabla swap step uses a 5% slippage tolerance (hardcoded). Excessive slippage could result in significant value loss per rebalance.
9. **SquidRouter gas pricing MUST not overpay excessively** — `gasMultiplier * 5n` is applied to `maxFeePerGas` for SquidRouter transactions. This aggressive multiplier ensures inclusion but could result in significant gas overpayment.
10. **Axelar polling MUST have a timeout** — **F-034 (legacy):** The legacy flow's Axelar polling loop (`while (!isExecuted)`) has no timeout — it will poll indefinitely if Axelar never reports success. This is a known deficiency in the legacy flow; the Base flow fixes it with a 30-minute timeout.

### Base flow invariants

11. **Daily bridge limit MUST be enforced** — Total requested USDC amount recorded by Base-flow histories per calendar day (UTC), including the amount about to be rebalanced, must not exceed `REBALANCING_DAILY_BRIDGE_LIMIT_USD`. Checked against both Base flow history entries before starting a new Base rebalance. This cap remains a hard upper bound in severe and `always` mode.
12. **Cost policy MUST run before fresh-run side effects** — For Base flows, route/two-leg quotes and the cost-policy decision must happen before `startNewRebalance`, approvals, swaps, transfers, ticket creation, or history writes. Resumed runs continue the already-started state and do not recompute a fresh skip decision.
13. **Severity bands MUST be monotonic** — Moderate deviation must be less than or equal to severe deviation. Mild cost tolerance must be less than or equal to moderate, moderate less than or equal to severe, and severe less than or equal to `REBALANCING_HARD_MAX_COST_BPS`.
14. **Mild/moderate imbalances MUST be skippable when cost exceeds tolerance** — In `auto` mode, fresh Base rebalances must skip when projected round-trip cost exceeds the configured limit for the current band.
15. **Severe imbalances MAY use higher tolerance but MUST NOT bypass hard caps** — Severe band can permit higher projected cost, but it cannot bypass the daily bridge limit, `REBALANCING_HARD_MAX_COST_BPS`, balance checks, slippage limits, or phase safety checks.
16. **Route comparison MUST handle provider failures gracefully** — If every enabled return route quote fails, the high-coverage flow MUST abort (not proceed with zero information). If some routes fail, the best available route is used. If `--route=` is specified, that route is still quoted and cost-gated before execution.
17. **Avenia fallback to SquidRouter MUST be atomic in state** — If Avenia ticket creation fails, the flow sets `winningRoute = "squidrouter"` and `currentPhase = AveniaTransferToPolygon` in a single `saveState()` call. A crash between the failure and the save could leave the flow in an inconsistent state.
18. **NonceManager MUST be re-initialized on resume** — The `NonceManager` is created fresh at the start of each execution from `getTransactionCount()`. On resume, it must not reuse stale nonces from a previous execution.
19. **Axelar cross-chain execution MUST have a timeout** — SquidRouter's Axelar polling has a 30-minute timeout. If Axelar does not confirm execution within this window, the flow MUST throw (not poll indefinitely). This resolves F-034 for the Base flow.
20. **Balance arrival checks MUST be delta-based** — The Base high-coverage flow persists pre-action balances before each arrival-producing operation and waits for `starting balance + expected delta` rather than checking absolute hot-wallet/provider balances. BRLA and Base USDC arrival checks allow a 99.8% tolerance to account for rounding, route deductions, and minor quote shortfalls without sweeping unrelated leftover balances into the current run. The actual received Base USDC delta is persisted before advancing to final verification.
21. **`EVM_ACCOUNT_SECRET` derives the same address on all EVM chains** — A single BIP-39 mnemonic is used for Base, Polygon, and Moonbeam. This means compromise of this one secret drains the rebalancer on ALL EVM chains. `PENDULUM_ACCOUNT_SECRET` is separate and legacy-only.
22. **Terminal Avenia ticket failures MUST abort immediately** — `checkTicketStatusPaid` treats `FAILED` as terminal and throws immediately instead of retrying until timeout.

## Threat Vectors & Mitigations

### Shared threats

| Threat | Mitigation |
|---|---|
| **⚠️ State file corruption from concurrent execution** — Two rebalancer instances read the same JSON file from Supabase Storage, both decide to rebalance, both execute phases simultaneously | **NO MITIGATION.** Supabase Storage has no file locking, no atomic compare-and-swap, no conditional writes. If the rebalancer is deployed as multiple instances or triggered concurrently, state corruption and double-execution are possible. |
| **Rebalancer key compromise** — Attacker obtains the rebalancer private key(s) | Full drain of the rebalancer's accounts on all affected chains. `EVM_ACCOUNT_SECRET` is one mnemonic for Base, Polygon, and Moonbeam; `PENDULUM_ACCOUNT_SECRET` is separate and only needed for legacy Pendulum operations. The API service accounts are separate, so ramp operations are not directly affected (but liquidity would be depleted). |
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
| **Route comparison manipulation** — Avenia, SquidRouter, and optional main Nabla quotes are fetched and compared; an attacker could manipulate one provider's rate to force another route | The rebalancer trusts provider quotes without independent verification. However, since all high-coverage routes end with USDC on Base, the worst case is choosing a slightly worse rate, not direct fund loss. The `slippage: 4` parameter on SquidRouter provides some buffer. |
| **Avenia ticket creation failure mid-flow** — Avenia API fails after the flow committed to the Avenia route | **Mitigated.** The flow catches ticket creation errors and falls back to SquidRouter by setting `winningRoute = "squidrouter"` and saving state. Avenia tickets that return `FAILED` after creation are terminal and abort immediately. |
| **Daily bridge limit bypass** — History entries are stored in Supabase Storage; an attacker who can modify the storage could clear history to bypass the daily limit | **Weak mitigation.** The limit is enforced client-side by reading history from Supabase and adding the current requested amount before starting. An attacker with Supabase access could also drain funds directly, so the limit bypass is a secondary concern. |
| **Cost-threshold misconfiguration** — Cost thresholds set too low can cause chronic under-rebalancing; thresholds set too high can cause repeated expensive rebalancing | Defaults are conservative and env parsing fails fast for non-monotonic values. Operators should first use `REBALANCING_POLICY_MODE=dry-run` to observe decisions before enabling tighter or looser production thresholds. |
| **Always-mode misuse** — Operator leaves `REBALANCING_POLICY_MODE=always` enabled and accepts expensive routes repeatedly | `always` still respects the daily bridge limit and `REBALANCING_HARD_MAX_COST_BPS`. Decision logs include band, projected cost, allowed cost, and reason so misuse is observable. |
| **Dry-run/off mode drift** — Cron appears healthy but liquidity is not actually moving | `dry-run` and `off` log explicit skip reasons. External monitoring must distinguish successful dry-run/off exits from real completed rebalances. |
| **Quote-cost manipulation near thresholds** — Provider quotes near a configured boundary can nudge execution or skipping | Cost policy uses the best/forced quoted route before any side effect. Hard max-cost cap limits catastrophic execution, but provider quote trust remains a known risk. |
| **NonceManager stale nonce** — If the process crashes after sending a transaction but before saving the nonce, the resumed execution could reuse the same nonce | **Mitigated.** `NonceManager` is re-initialized from `getTransactionCount()` on each execution. The stored transaction hashes in state also prevent re-execution of already-completed phases. |
| **`EVM_ACCOUNT_SECRET` single-key blast radius** — One mnemonic controls all EVM chain accounts for the rebalancer | Compromise of this one secret drains rebalancer funds on Base, Polygon, and Moonbeam. The separate `PENDULUM_ACCOUNT_SECRET` limits Pendulum blast radius to the legacy flow. This is a deliberate simplification accepted for operational convenience. |
| **SquidRouter cross-chain timeout** — Axelar cross-chain execution could take longer than 30 minutes during network congestion | The rebalancer throws on timeout, leaving the BRLA-to-USDC swap incomplete on Polygon. Funds would be stuck as BRLA on Polygon until manual intervention or the next rebalance attempt resumes from the `SquidRouterApproveAndSwap` phase. |
| **Absolute balance false positives** — Hot wallets/provider accounts can contain leftovers from previous runs, so absolute balance checks could pass before the current run's funds arrive | **Mitigated for Base flow.** The flow stores pre-action baselines and waits for deltas on Avenia BRLA, Polygon BRLA, and Base USDC arrivals. |
| **BRLA balance tolerance (99.8%)** — BRLA delta checks accept 99.8% of expected amount as sufficient | If Avenia deducts a fee > 0.2%, the flow will not proceed and will time out. The tolerance prevents rounding dust from blocking valid arrivals while rejecting meaningful shortfalls. |

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
- [x] Verify legacy coverage trigger is appropriate for the expected token volumes. **PASS** — legacy flow still checks BRLA over-coverage while USDC.axl is not over-covered before starting.
- [x] Verify the rebalancer private keys are distinct from all API service keys. **PASS** — separate env vars and accounts confirmed.
- [PARTIAL] Verify step idempotency: can each of the 8 steps be safely re-executed after a crash? Check for nonce guards, balance checks, or transaction hash verification. **PARTIAL F-033** — steps 2, 3, 5, 6, 7 are NOT idempotent; crash between step execution and `saveState()` causes double-spend risk.
- [PARTIAL] Verify the BRLA→USDC swap (step 3) validates the received USDC amount against expectations. **PARTIAL** — BRLA API response is trusted; no independent amount verification.
- [FAIL] Verify the SquidRouter swap (step 5) validates the received axlUSDC amount against expectations. **FAIL F-034** — no output amount validation AND Axelar status polling has no timeout; infinite loop risk if Axelar never reports success.

### Base flows

- [x] **FINDING**: Axelar polling has 30-minute timeout — resolves F-034 for Base flow. **PASS** — `axelarTimeout = 30 * 60 * 1000` enforced in `squidRouterApproveAndSwap()`.
- [x] **FINDING**: Daily bridge limit check — `REBALANCING_DAILY_BRIDGE_LIMIT_USD` (default 10,000) enforced against both Base-flow histories plus the current requested amount. **PASS** — checked before starting new Base rebalance; prevents runaway execution beyond the cap.
- [x] **FINDING**: Avenia fallback to SquidRouter — if Avenia ticket creation fails, flow falls back to SquidRouter route. **PASS** — error caught, `winningRoute` updated, state saved atomically.
- [x] **FINDING**: `EVM_ACCOUNT_SECRET` single mnemonic for all EVM chains — broad EVM blast radius across Base, Polygon, and Moonbeam. **PASS (accepted)** — deliberate simplification; documented in invariants.
- [x] Verify route comparison handles partial failures — what happens if one provider's quote fails? **PASS** — if every enabled route fails, throws; otherwise uses the best available route. If `--route=` is specified, only fetches that quote.
- [x] Verify NonceManager re-initialization on resume — does it fetch fresh nonce from chain? **PASS** — `NonceManager.create()` calls `getTransactionCount()` on each execution.
- [x] Verify BRLA balance arrival tolerance (99.8%) is appropriate. **PASS** — accounts for rounding and minor fee deductions; 0.2% tolerance is tight enough to reject significant shortfalls.
- [x] Verify `checkTicketStatusPaid` has a timeout and treats FAILED as terminal. **PASS** — 5-minute timeout with 5-second poll interval; FAILED tickets throw immediately.
- [x] Verify `waitForBrlaOnAvenia` has a timeout. **PASS** — 10-minute timeout with 5-second poll interval.
- [x] Verify `waitUsdcOnBase` has a timeout. **PASS** — 30-minute timeout via `checkEvmBalancePeriodically`.
- [x] Verify `waitBrlaOnPolygon` has a timeout. **PASS** — 10-minute timeout via `checkEvmBalancePeriodically`.
- [PARTIAL] Verify the Nabla swap validates output amount against expectations. **PARTIAL** — uses `AMM_MINIMUM_OUTPUT_HARD_MARGIN` (5%) for slippage protection via `quoteSwapExactTokensForTokens`, but post-swap balance is verified by comparing pre/post BRLA balance (not against the quote). A sandwich attack could extract up to 5%.
- [x] Verify the `usdcBasePhaseOrder` overlap (`AveniaTransferToPolygon` and `AveniaSwapToUsdcBase` both at order 6; both wait phases at order 7) cannot cause incorrect phase transitions. **PASS** — routes are mutually exclusive, guarded by `if (state.winningRoute === "avenia")` / `if (state.winningRoute === "squidrouter")` checks.
- [x] Verify Base flow arrival checks are delta-based. **PASS** — Avenia BRLA, Polygon BRLA, Avenia USDC-on-Base, and SquidRouter USDC-on-Base waits all use persisted pre-action baselines plus expected deltas. Base USDC waits use the default 99.8% tolerance and persist the actual received delta before final verification.
- [x] Verify Nabla swap resume cannot lose the received BRLA amount. **PASS** — pre-swap BRLA baseline and swap hash are persisted; resume computes output from the persisted baseline or reuses already recorded output.
- [x] Verify Base low-coverage flow state/history is isolated from the high-coverage flow. **PASS** — `BrlaToUsdcBaseStateManager` uses `rebalancer_state_brla_to_usdc_base.json` while sharing the daily limit calculation.
- [x] Verify mild/moderate expensive rebalances are skipped in `auto` mode. **PASS** — projected cost is compared against the configured band threshold before any fresh Base state write or transaction.
- [x] Verify severe imbalances can execute at a higher configured cost while still respecting hard caps. **PASS** — severe uses `REBALANCING_MAX_COST_BPS_SEVERE`, bounded by `REBALANCING_HARD_MAX_COST_BPS`.
- [x] Verify `off` mode performs no fresh Base execution. **PASS** — policy returns a skip decision before quotes, state writes, balances, approvals, swaps, transfers, or tickets.
- [x] Verify `dry-run` mode performs no approvals/swaps/transfers/history mutations. **PASS** — policy quotes and logs the decision, then exits before state creation.
- [x] Verify `always` mode still enforces daily bridge limit and hard max-cost cap. **PASS** — daily limit is checked before policy evaluation; policy rejects cost above `REBALANCING_HARD_MAX_COST_BPS` in every mode.
- [x] Verify skipped decisions are observable. **PASS** — logs include direction, band, projected cost bps, allowed bps, input, projected output, projected cost, and reason.
