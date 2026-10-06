# Rebalancer

## What This Does

The rebalancer is a standalone service (`apps/rebalancer/`) that monitors token coverage ratios and automatically moves liquidity across chains when ratios indicate a pool imbalance. Its primary function is ensuring the platform has sufficient tokens to service ramp operations without manual intervention.

The default Base rebalancer is cost-aware. A coverage-ratio breach makes a fresh cron run eligible for evaluation, but execution still depends on the configured urgency band and projected round-trip cost. Mild and moderate imbalances can be skipped when route quotes are unfavorable; severe imbalances tolerate higher configured cost. When coverage is already inside the configured bounds, the USDC → BRLA → USDC flow may still run opportunistically, but only if its projected route cost is below `REBALANCING_OPPORTUNISTIC_USDC_TO_BRLA_MAX_COST_BPS` (default 10 bps). `REBALANCING_HARD_MAX_COST_BPS` remains a hard projected-cost cap in every mode. `REBALANCING_DAILY_BRIDGE_LIMIT_USD` caps non-profitable fresh Base runs, but a quote that projects profit may bypass the daily cap while still being recorded in history after completion. When a separate profitable USDC → BRLA → USDC amount is configured, the flow evaluates that larger amount with its own fresh quotes and executes it only when that larger quote projects profit and the rebalancer's Base USDC balance covers it.

**Current implementation:** Two Base paths. The historical BRLA ↔ axlUSDC (Pendulum/Moonbeam) flow has been removed from the codebase; the CLI still rejects `--legacy` before configuration or chain access.

1. **USDC → BRLA → USDC (Base)** — Default high-coverage flow. Multi-step process on Base with route optimization across SquidRouter, Avenia, and optional main Nabla.
2. **BRLA → USDC correction (Base)** — Default low-coverage flow. Base-only two-swap process that uses main Nabla for USDC→BRLA and the BRLA pool for BRLA→USDC.

**Architecture:**
- `index.ts` — Entry point: rejects `--legacy`, then parses the active Base arguments (`--restart`, `--route=`, amount), checks coverage ratios, and selects a Base flow
- `rebalance/usdc-brla-usdc-base/index.ts` — Base high-coverage orchestrator: multi-step state machine with route branching
- `rebalance/usdc-brla-usdc-base/steps.ts` — Base high-coverage step implementations (Nabla swaps, Avenia transfers, SquidRouter, rate comparison)
- `rebalance/brla-to-usdc-base/index.ts` — Base low-coverage orchestrator: main Nabla + BRLA-pool two-swap correction
- `rebalance/brla-to-usdc-base/steps.ts` — Base low-coverage step implementations
- `services/stateManager.ts` — Generic `StateManager<T>` base class + flow-specific managers (`UsdcBaseStateManager`, `BrlaToUsdcBaseStateManager`)
- `services/indexer/index.ts` — Base Nabla coverage ratio query (on-chain reads)
- `utils/config.ts` — Configuration and secret loading
- `utils/nonce.ts` — `NonceManager` for sequential EVM transaction nonces
- `utils/transactions.ts` — Transaction confirmation helpers

**CLI interface:**
```
bun run start [amount] [--restart] [--route=squidrouter|avenia|nabla-main]
```
- No flag → Base flow (default)
- `--legacy` → rejected with a non-zero exit before runtime configuration or RPC access
- `--restart` → Force fresh state, ignore in-progress rebalance
- `--route=squidrouter|avenia|nabla-main` → Constrain the high-coverage return route; the route is still quoted and cost-gated before execution

**Cost policy controls:**
- `REBALANCING_POLICY_MODE=auto|dry-run|off|always` — `auto` applies urgency-band cost gating; `dry-run` quotes and logs the decision without state writes or fund movement; `off` skips fresh Base rebalances; `always` bypasses per-band cost gating but still respects `REBALANCING_HARD_MAX_COST_BPS`. The daily bridge limit still blocks non-profitable quotes in every executing mode, but projected-profitable quotes may bypass it.
- `REBALANCING_MODERATE_DEVIATION_BPS` / `REBALANCING_SEVERE_DEVIATION_BPS` — classify coverage deviation beyond the trigger bound into mild, moderate, or severe bands.
- `REBALANCING_MAX_COST_BPS_MILD` / `REBALANCING_MAX_COST_BPS_MODERATE` / `REBALANCING_MAX_COST_BPS_SEVERE` — maximum projected round-trip cost per urgency band.
- `REBALANCING_HARD_MAX_COST_BPS` — final projected-cost ceiling enforced even in `always` mode.
- `REBALANCING_OPPORTUNISTIC_USDC_TO_BRLA_MAX_COST_BPS` — maximum projected route cost for in-range opportunistic USDC → BRLA → USDC execution (default 10 bps).
- `REBALANCING_MAX_USDC_COVERAGE` — optional cap on the Base Nabla USDC pool coverage ratio (e.g. `1.3`) that a USDC → BRLA → USDC run may leave behind. Unset means no cap.
- `REBALANCING_USD_TO_BRL_AMOUNT` / `REBALANCING_PROFITABLE_USD_TO_BRL_AMOUNT` — standard and projected-profitable USDC → BRLA → USDC sizing. The profitable amount defaults to the standard amount when unset and is used only when the Base USDC balance covers it and a fresh quote for that larger size projects profit.

---

### Flow 1: USDC → BRLA → USDC (Base, default high-coverage flow)

**Trigger condition:** Base Nabla BRLA pool coverage ratio > `1 + REBALANCING_THRESHOLD_USDC_TO_BRLA` (default upper bound `1.01`). Falls back to `REBALANCING_THRESHOLD` when the route-specific threshold is unset. This makes the flow eligible for evaluation; cost policy may still skip fresh execution. If coverage is inside the configured bounds, the same flow can run opportunistically with zero coverage deviation only when the selected quote's projected route cost is below `REBALANCING_OPPORTUNISTIC_USDC_TO_BRLA_MAX_COST_BPS` (default 10 bps).

**USDC pool coverage cap:** The flow swaps its USDC amount into the Base Nabla USDC pool. When `REBALANCING_MAX_USDC_COVERAGE` is set, both the regular and the opportunistic trigger read that pool's reserve and liabilities before any quote and skip a fresh run whose amount would push `(reserve + amount) / liabilities` above the cap. The larger profitable amount is only evaluated when it also fits under the cap. Resumed in-flight runs are not re-checked.

**Daily bridge limit:** Total requested USDC amount recorded by Base-flow history per calendar day (UTC), including the amount about to be rebalanced, must not exceed `REBALANCING_DAILY_BRIDGE_LIMIT_USD` (default 10,000) for paid current runs. Profit is inferred from projected output USDC greater than input USDC, which also yields negative projected cost bps. Projected-profitable current runs bypass the cap entirely. For paid runs, the limit decision is checked against both `UsdcBaseStateManager` and `BrlaToUsdcBaseStateManager` history after quote/cost-policy evaluation and before any fresh Base state write or transaction. Completed profitable runs still write normal history entries, so they remain visible in later paid-run daily accounting.

**Urgency-band policy:** Before any state write or transaction, the flow quotes the expected round-trip USDC output. Projected cost is `(input USDC - projected output USDC) / input USDC` in basis points. `auto` mode executes only when the projected cost is within the configured limit for the current coverage-deviation band. `dry-run` logs the same decision but never starts a rebalance. `off` skips without quoting. `always` can execute above the band limit, but not above `REBALANCING_HARD_MAX_COST_BPS`; the daily bridge limit still applies unless the quote projects profit. Standard and profitable configured amounts are quoted independently when they differ; stale standard-amount quotes must not be reused for larger execution.

**Rebalancing flow:**
1. Check initial USDC balance on Base (sufficient for requested amount)
2. Before any on-chain action, quote the first Nabla USDC → BRLA swap to estimate BRLA output, then compare rates between SquidRouter, Avenia, and optional main Nabla for BRLA → USDC conversion
   - If `--route=` is specified, execution is constrained to that route and the policy still requires a quote for that route before executing the common first swap
   - Main Nabla route is available only when both `MAIN_NABLA_ROUTER` and `MAIN_NABLA_QUOTER` are set
   - If every enabled route quote fails, aborts
   - If one fails, uses the other
   - The selected quote feeds both route selection and the cost-policy gate before any on-chain action
3. Nabla approve + swap: USDC → BRLA on Base
4. Transfer BRLA to Avenia business account on Base (ERC-20 transfer)
5. Wait for BRLA delta to appear on Avenia internal balance (polling, 10-min timeout)

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
   - Before creating/retrying a BRLA-to-Polygon Avenia ticket, and after ticket status failures, reconcile any Polygon BRLA delta against the persisted baseline. If the expected BRLA already arrived, continue to arrival confirmation; for `PARTIAL-FAILED`, create a replacement ticket only for the remaining amount.
10c. SquidRouter approve + swap: BRLA on Polygon → USDC on Base
11c. Wait for Axelar cross-chain execution (30-min timeout)
12c. Wait for USDC delta arrival on Base (balance polling, 30-min timeout)

**Verification:**
12. Verify final USDC balance on Base
13. Record history entry (amount, cost, cost-relative, timestamps)
14. Send Slack notification with route, amount, and cost metrics

**Fallback:** If Avenia ticket creation fails during Route B, the flow falls back to Route C (SquidRouter).

**Key secrets:** `EVM_ACCOUNT_SECRET` (single BIP-39 mnemonic, derives accounts for Base + Polygon).

---

### Flow 2: BRLA → USDC correction (Base, default low-coverage flow)

**Trigger condition:** Base Nabla BRLA pool coverage ratio < `1 - REBALANCING_THRESHOLD_BRLA_TO_USDC` (default lower bound `0.99`). Falls back to `REBALANCING_THRESHOLD` when the route-specific threshold is unset. This makes the flow eligible for evaluation; cost policy may still skip fresh execution.

**Daily bridge limit:** Uses the same Base-flow daily limit and projected-profit bypass described above. Completed runs record history in `rebalancer_state_brla_to_usdc_base.json`.

**Urgency-band policy:** Uses the same Base policy controls as the high-coverage flow. Before any state write or transaction, the rebalancer pre-quotes the main Nabla USDC→BRLA leg and the BRLA-pool BRLA→USDC leg, then applies the band-specific projected-cost threshold.

**Rebalancing flow:**
1. Check initial USDC balance on Base
2. Main Nabla swap: USDC → BRLA on Base
3. BRLA pool swap: BRLA → USDC on Base
4. Verify final USDC balance on Base
5. Record history entry and send Slack notification

**Key secrets:** `EVM_ACCOUNT_SECRET` for Base transactions.

## Security Invariants

### Shared

1. **Coverage ratio check MUST precede active rebalancing** — Base flows use on-chain Nabla contract reads and become eligible above `1 + REBALANCING_THRESHOLD_USDC_TO_BRLA` or below `1 - REBALANCING_THRESHOLD_BRLA_TO_USDC`. When Base coverage is inside the configured bounds, only the USDC → BRLA → USDC flow may run, and only under the configured opportunistic projected-cost guard. The CLI MUST reject `--legacy` before configuration, state loading, or RPC access so the removed Pendulum/Moonbeam flow cannot be selected by an unknown flag falling through to a live Base flow.
2. **State persistence MUST survive process restarts** — Each flow has its own Supabase Storage JSON file (`rebalancer_state_usdc_base.json` for Base high-coverage, `rebalancer_state_brla_to_usdc_base.json` for Base low-coverage). On restart, the rebalancer reads the file and resumes from the last completed phase.
3. **Each phase MUST be idempotent or guarded against re-execution** — If the process crashes mid-phase and resumes, re-executing a completed phase must not cause double-swaps, double-transfers, or double-settlements. Transaction hashes and pre-action balance baselines are stored in state to detect already-completed phases and verify per-run deltas.
4. **Rebalancer private keys MUST be isolated from API service keys** — The rebalancer keys operate separate accounts. Compromise of rebalancer keys should not affect API ramp operations, and vice versa.
5. **BRLA business account address MUST be verified** — `brlaBusinessAccountAddress` has a hardcoded default (`0xDF5Fb34B90e5FDF612372dA0c774A516bF5F08b2`). If this address is wrong, funds are sent to the wrong recipient with no recovery.
6. **Concurrent rebalancer executions MUST NOT corrupt state** — If two rebalancer instances run simultaneously, both would read the same state file and potentially execute the same phases in parallel. Supabase Storage has no file locking or atomic compare-and-swap.
7. **Policy modes MUST be fail-safe** — `off` performs no fresh Base rebalancing; `dry-run` performs read-only quote/evaluation/logging with no state writes, tickets, approvals, swaps, transfers, or history entries; `always` bypasses per-band cost gating only, not `REBALANCING_HARD_MAX_COST_BPS`. The daily bridge limit still blocks non-profitable quotes in every executing mode, while projected-profitable quotes may bypass it.

### Base flow invariants

8. **Daily bridge limit MUST be enforced for paid current runs** — Total requested USDC amount recorded by Base-flow histories per calendar day (UTC), including the amount about to be rebalanced, must not exceed `REBALANCING_DAILY_BRIDGE_LIMIT_USD` for non-profitable fresh Base runs. The limit decision must run after quote/cost-policy evaluation and before fresh state writes or transactions for paid runs. Projected-profitable current runs bypass the cap entirely, but completed profitable runs must still be recorded in history so they count toward later paid-run checks.
9. **Cost policy MUST run before fresh-run side effects** — For Base flows, route/two-leg quotes and the cost-policy decision must happen before `startNewRebalance`, approvals, swaps, transfers, ticket creation, or history writes. Resumed runs continue the already-started state and do not recompute a fresh skip decision. A non-idle state file is resumed after the coverage read but before any fresh quote, sizing, daily-limit, or Base USDC balance check, including on the opportunistic in-range path, because the in-flight USDC is no longer in the wallet. `dry-run` mode does not resume it either: the invocation ends without a fresh evaluation and the run stays paused until an executing mode is restored.
10. **Severity bands MUST be monotonic** — Moderate deviation must be less than or equal to severe deviation. Mild cost tolerance must be less than or equal to moderate, moderate less than or equal to severe, and severe less than or equal to `REBALANCING_HARD_MAX_COST_BPS`.
11. **Mild/moderate imbalances MUST be skippable when cost exceeds tolerance** — In `auto` mode, fresh Base rebalances must skip when projected round-trip cost exceeds the configured limit for the current band.
12. **Opportunistic in-range rebalances MUST stay below the configured projected-cost cap** — When coverage is already inside `[lowerBound, upperBound]`, only USDC → BRLA → USDC may run opportunistically. It must use the normal cost-policy quote, daily-limit/profit decision, Base USDC balance check, route selection, hard max-cost cap, and state machine; it must skip when projected route cost is greater than or equal to `REBALANCING_OPPORTUNISTIC_USDC_TO_BRLA_MAX_COST_BPS` (default 10 bps). If an opportunistic Avenia route later falls back to SquidRouter, the preflight SquidRouter quote must independently satisfy the normal cost policy, the configured opportunistic cap, and the profitable-quote requirement when the original current quote skipped the daily bridge limit because it was projected profitable.
13. **Severe imbalances MAY use higher tolerance but MUST NOT bypass hard cost caps** — Severe band can permit higher projected cost, but it cannot bypass `REBALANCING_HARD_MAX_COST_BPS`, balance checks, slippage limits, or phase safety checks. It also cannot bypass the daily bridge limit unless the selected quote projects profit.
14. **Profitable-size execution MUST use matching fresh quotes** — The high-coverage flow may switch from `REBALANCING_USD_TO_BRL_AMOUNT` to `REBALANCING_PROFITABLE_USD_TO_BRL_AMOUNT` only after the profitable amount's own quote projects profit. It must not infer larger-size profitability, route selection, or daily-limit bypass from the standard amount's quote. Manual CLI amounts bypass this automatic up-sizing.
15. **Route comparison MUST handle provider failures gracefully** — If every enabled return route quote fails, the high-coverage flow MUST abort (not proceed with zero information). If some routes fail, the best available route is used. If `--route=` is specified, that route is still quoted and cost-gated before execution.
16. **Avenia fallback to SquidRouter MUST be atomic in state** — If Avenia ticket creation fails, the flow sets `winningRoute = "squidrouter"` and `currentPhase = AveniaTransferToPolygon` in a single `saveState()` call. A crash between the failure and the save could leave the flow in an inconsistent state.
17. **NonceManager MUST be re-initialized on resume** — The `NonceManager` is created fresh at the start of each execution from `getTransactionCount()`. On resume, it must not reuse stale nonces from a previous execution.
18. **Axelar cross-chain execution MUST have a timeout** — SquidRouter's Axelar polling has a 30-minute timeout. If Axelar does not confirm execution within this window, the flow MUST throw (not poll indefinitely). This resolves finding F-034, which applied to the removed legacy flow.
19. **SquidRouter source transactions MUST be receipt-gated before Axelar polling** — On resume, a persisted Polygon SquidRouter swap hash must be checked on Polygon before Axelar polling starts. Before retrying a failed or missing SquidRouter swap, the flow must first check whether the expected Base USDC delta already arrived from the previous attempt. If not recovered and the source receipt failed, the stale hash/quote must be cleared and the flow must request a fresh SquidRouter route instead of waiting for an Axelar execution that can never occur.
20. **Balance arrival checks MUST be delta-based** — The Base high-coverage flow persists pre-action balances before each arrival-producing operation and waits for `starting balance + expected delta` rather than checking absolute hot-wallet/provider balances. Avenia BRLA arrival checks allow a 95% tolerance for provider-side deductions, while Base/Polygon on-chain arrival checks use the default 99.8% tolerance for rounding, route deductions, and minor quote shortfalls without sweeping unrelated leftover balances into the current run. The actual received Base USDC delta is persisted before advancing to final verification.
21. **SquidRouter swaps MUST require available Polygon BRLA before submission** — Before requesting and submitting a fresh SquidRouter Polygon BRLA → Base USDC swap, the flow must verify the Polygon account still holds at least the BRLA amount selected for the swap. If the balance is insufficient and Base USDC recovery does not prove completion, the flow MUST throw instead of submitting an inevitably failing transaction.
22. **`EVM_ACCOUNT_SECRET` retains a cross-chain derivation blast radius** — A single BIP-39 mnemonic derives the same address on Base, Polygon, and historically Moonbeam. Active automation uses Base/Polygon, but compromise may still expose any unreconciled historical Moonbeam balance.
23. **Terminal Avenia ticket failures MUST NOT poll indefinitely** — `checkTicketStatusPaid` treats `FAILED` as terminal and throws immediately instead of retrying until timeout. `PARTIAL-FAILED` is surfaced as a retryable ticket-specific status so the SquidRouter BRLA-to-Polygon branch can reconcile partial arrival and create a replacement ticket only for the remaining amount.
24. **USDC → BRLA → USDC MUST respect the configured USDC pool coverage cap** — When `REBALANCING_MAX_USDC_COVERAGE` is set, a fresh run (regular or opportunistic) must not start, or be quoted, if adding its amount to the Base Nabla USDC pool reserve would exceed the cap times the pool's liabilities. The check reads the pool on-chain each invocation, before route quotes, and skips rather than fails.

## Threat Vectors & Mitigations

### Shared threats

| Threat | Mitigation |
|---|---|
| **⚠️ State file corruption from concurrent execution** — Two rebalancer instances read the same JSON file from Supabase Storage, both decide to rebalance, both execute phases simultaneously | **NO MITIGATION.** Supabase Storage has no file locking, no atomic compare-and-swap, no conditional writes. If the rebalancer is deployed as multiple instances or triggered concurrently, state corruption and double-execution are possible. |
| **Rebalancer key compromise** — Attacker obtains the rebalancer private key(s) | Full drain of active Base/Polygon accounts and any unreconciled balance at the historically derived Moonbeam address. API service accounts remain separate. |
| **Hardcoded business account address** — `brlaBusinessAccountAddress` default is wrong or points to an attacker-controlled address | Funds would be sent to the wrong address. The address should be verified against BRLA's official documentation and set via environment variable, not hardcoded. |
| **State file deletion or corruption** — Supabase Storage file is deleted or corrupted manually | The rebalancer would lose track of in-progress operations. Phases that already executed (swaps, transfers) would not be resumed, and the rebalancer would start fresh. This could leave funds stranded mid-flow. |
| **Stale coverage ratio** — The coverage ratio is checked once at startup, but by the time the multi-step rebalance completes, the ratio may have changed significantly | No re-check between phases. The rebalance amount is calculated upfront. If conditions change during the multi-step process, the rebalance may be unnecessary or insufficient. |

### Base flow threats

| Threat | Mitigation |
|---|---|
| **Route comparison manipulation** — Avenia, SquidRouter, and optional main Nabla quotes are fetched and compared; an attacker could manipulate one provider's rate to force another route | The rebalancer trusts provider quotes without independent verification. However, since all high-coverage routes end with USDC on Base, the worst case is choosing a slightly worse rate, not direct fund loss. The `slippage: 4` parameter on SquidRouter provides some buffer. |
| **Avenia ticket creation or transfer-ticket failure mid-flow** — Avenia API fails after the flow committed to the Avenia route, or the SquidRouter branch's BRLA-to-Polygon transfer ticket reaches `FAILED`/`PARTIAL-FAILED` after funds may already have arrived | **Mitigated.** Direct Avenia ticket creation errors fall back to SquidRouter by setting `winningRoute = "squidrouter"` and saving state. For SquidRouter BRLA-to-Polygon tickets, the flow checks the Polygon BRLA delta before creating a new ticket and again after ticket-status failures. If the expected BRLA already arrived, it continues to arrival confirmation; `PARTIAL-FAILED` creates a replacement ticket only for the remaining BRLA. Other Avenia ticket failures remain terminal when Polygon balance recovery does not prove completion. |
| **Daily bridge limit bypass** — History entries are stored in Supabase Storage; an attacker who can modify the storage could clear history to bypass the daily limit. Separately, projected-profitable quotes intentionally bypass the daily cap. | **Weak mitigation.** The limit is enforced client-side by reading history from Supabase and adding the current requested amount before starting. The intentional profit bypass requires a quote with projected output greater than input and still writes history on completion. An attacker with Supabase access could also drain funds directly, so malicious history tampering is a secondary concern. |
| **Cost-threshold misconfiguration** — Cost thresholds set too low can cause chronic under-rebalancing; thresholds set too high can cause repeated expensive rebalancing | Defaults are conservative and env parsing fails fast for non-monotonic values. Operators should first use `REBALANCING_POLICY_MODE=dry-run` to observe decisions before enabling tighter or looser production thresholds. |
| **Always-mode misuse** — Operator leaves `REBALANCING_POLICY_MODE=always` enabled and accepts expensive routes repeatedly | `always` still respects `REBALANCING_HARD_MAX_COST_BPS` and the daily bridge limit for non-profitable quotes. Decision logs include band, projected cost, allowed cost, daily-limit decision, and reason so misuse is observable. |
| **Dry-run/off mode drift** — Cron appears healthy but liquidity is not actually moving | `dry-run` and `off` log explicit skip reasons. External monitoring must distinguish successful dry-run/off exits from real completed rebalances. |
| **Opportunistic rebalancing churn** — In-range coverage could repeatedly execute when quotes are merely acceptable but not needed for liquidity correction | The opportunistic path is restricted to USDC → BRLA → USDC, requires projected cost below `REBALANCING_OPPORTUNISTIC_USDC_TO_BRLA_MAX_COST_BPS` (default 10 bps), still runs the normal cost policy and daily-limit/profit decision, and records completed runs in history. Avenia-to-SquidRouter fallback during an opportunistic run is allowed only when the preflight SquidRouter quote also satisfies the opportunistic cost and daily-limit/profit approval context. |
| **Quote-cost manipulation near thresholds** — Provider quotes near a configured boundary can nudge execution or skipping | Cost policy uses the best/forced quoted route before any side effect. Hard max-cost cap limits catastrophic execution, but provider quote trust remains a known risk. |
| **NonceManager stale nonce** — If the process crashes after sending a transaction but before saving the nonce, the resumed execution could reuse the same nonce | **Mitigated.** `NonceManager` is re-initialized from `getTransactionCount()` on each execution. The stored transaction hashes in state also prevent re-execution of already-completed phases. |
| **`EVM_ACCOUNT_SECRET` single-key blast radius** — One mnemonic derives active Base/Polygon and historical Moonbeam accounts | Compromise drains active rebalancer balances and may expose unreconciled historical Moonbeam funds. |
| **SquidRouter source transaction failure, duplicate retry, or cross-chain timeout** — The Polygon source swap can fail before Axelar sees it, a previous attempt may already have delivered USDC on Base, or Axelar cross-chain execution could take longer than 30 minutes during network congestion | **Partially mitigated.** On resume, the Base flow checks for a recovered Base USDC delta before retrying, checks the persisted Polygon SquidRouter swap receipt before Axelar polling, and refuses fresh SquidRouter submissions when Polygon BRLA is below the intended input. Failed source receipts clear the stale hash/quote and retry with a fresh route only when Base recovery is not already proven. If the source succeeds but Axelar does not confirm within 30 minutes, the rebalancer throws and the next attempt resumes from `SquidRouterApproveAndSwap`. |
| **Absolute balance false positives** — Hot wallets/provider accounts can contain leftovers from previous runs, so absolute balance checks could pass before the current run's funds arrive | **Mitigated for Base flow.** The flow stores pre-action baselines and waits for deltas on Avenia BRLA, Polygon BRLA, and Base USDC arrivals. Avenia BRLA-to-Polygon recovery also uses the persisted Polygon baseline before treating a failed ticket as recoverable. |
| **BRLA balance tolerance** — Avenia BRLA delta checks accept 95% of expected amount as sufficient, while on-chain Base/Polygon arrival checks use 99.8% | If Avenia deducts a fee > 5%, the flow will not proceed and will time out. The tolerance prevents provider-side deductions and rounding dust from blocking valid arrivals while rejecting meaningful shortfalls. |

## Audit Checklist

### Shared

- [ ] **FINDING**: State stored as JSON file in Supabase Storage — no locking, no atomic updates. **ACCEPTED RISK RISK-012** — rebalancer is a one-shot CLI process (`process.exit(0/1)`); concurrency depends entirely on deployment scheduling (cron). No in-code concurrency guard.
- [ ] **FINDING**: `brlaBusinessAccountAddress` has hardcoded default `0xDF5Fb34B90e5FDF612372dA0c774A516bF5F08b2` — verify this is the correct BRLA business account and that it's set via environment variable in production. **PARTIAL** — address is overridable via env var but has hardcoded default; correctness of default requires external verification.
- [x] Verify Supabase Storage write errors are handled — what happens if state cannot be persisted after a phase completes? **PASS** — errors propagate and cause process exit; no silent data loss.
- [ ] Verify the rebalancer has monitoring/alerting for: failed phases, insufficient balances, stuck state. **PARTIAL** — `process.exit(1)` on failure provides signal for external monitoring, but no built-in alerting. Slack notifications on completion provide some visibility.
- [x] Verify no rebalancer secrets are logged (check all error handlers and debug logging). **PASS** — no secret logging found.
- [x] Check whether the rebalancer runs on a schedule (cron) or is triggered manually — determines concurrency risk. **PASS** — one-shot CLI process; concurrency controlled by external scheduler.
- [x] Verify the `StateManager<T>` handles missing or corrupted state files gracefully (fresh start vs crash). **PASS** — missing state treated as fresh start; `upsert: true` for writes; invalid JSON treated as missing with console warning.
- [x] Verify legacy CLI cannot execute. **PASS** — `--legacy` exits non-zero before configuration, state loading, or RPC work; a regression test pins the guard. The legacy flow itself has been removed.
- [x] Verify the rebalancer private keys are distinct from all API service keys. **PASS** — separate env vars and accounts confirmed.

### Base flows

- [x] **FINDING**: Axelar polling has 30-minute timeout — resolves F-034 (legacy flow, removed). **PASS** — `axelarTimeout = 30 * 60 * 1000` enforced in `squidRouterApproveAndSwap()`.
- [x] **FINDING**: Daily bridge limit check — `REBALANCING_DAILY_BRIDGE_LIMIT_USD` (default 10,000) enforced against both Base-flow histories plus the current requested amount for paid runs. **PASS** — checked after quote/cost-policy evaluation and before fresh Base side effects for non-profitable quotes. Projected-profitable current runs bypass the cap and are still recorded in history after completion.
- [x] **FINDING**: Opportunistic in-range trigger — Base coverage inside configured bounds can still run USDC→BRLA→USDC only when projected route cost is below `REBALANCING_OPPORTUNISTIC_USDC_TO_BRLA_MAX_COST_BPS` (default 10 bps). **PASS** — uses the same quote/cost-policy path with zero coverage deviation, then applies the configured opportunistic cap before balance checks and state-machine execution. Opportunistic Avenia fallback to SquidRouter is blocked unless the preflight SquidRouter quote independently passes the same policy and profitable-bypass requirements.
- [x] **FINDING**: Avenia fallback to SquidRouter — if Avenia ticket creation fails, flow falls back to SquidRouter route. **PASS** — error caught, `winningRoute` updated, state saved atomically.
- [ ] **FINDING**: `EVM_ACCOUNT_SECRET` historically derives the same address on Base, Polygon, and Moonbeam. **ACCEPTED CURRENT ARCHITECTURE** — active runtime use is Base/Polygon; any historical Moonbeam balance remains part of RISK-020 reconciliation.
- [x] Verify route comparison handles partial failures — what happens if one provider's quote fails? **PASS** — if every enabled route fails, throws; otherwise uses the best available route. If `--route=` is specified, only fetches that quote.
- [x] Verify NonceManager re-initialization on resume — does it fetch fresh nonce from chain? **PASS** — `NonceManager.create()` calls `getTransactionCount()` on each execution.
- [x] Verify BRLA balance arrival tolerance is appropriate. **PASS** — Avenia BRLA uses a 95% threshold for provider-side deductions; on-chain Base/Polygon arrivals use 99.8% to account for rounding and minor route deductions while rejecting significant shortfalls.
- [x] Verify `checkTicketStatusPaid` has a timeout and treats terminal/retryable ticket statuses explicitly. **PASS** — 5-minute timeout with 5-second poll interval; `FAILED` tickets throw immediately; `PARTIAL-FAILED` tickets surface a retryable status for route-specific handling instead of timing out.
- [x] Verify `waitForBrlaOnAvenia` has a timeout. **PASS** — 10-minute timeout with 5-second poll interval.
- [x] Verify `waitUsdcOnBase` has a timeout. **PASS** — 30-minute timeout via `checkEvmBalancePeriodically`.
- [x] Verify `waitBrlaOnPolygon` has a timeout. **PASS** — 10-minute timeout via `checkEvmBalancePeriodically`.
- [ ] Verify the Nabla swap validates output amount against expectations. **PARTIAL** — uses `AMM_MINIMUM_OUTPUT_HARD_MARGIN` (5%) for slippage protection via `quoteSwapExactTokensForTokens`, but post-swap balance is verified by comparing pre/post BRLA balance (not against the quote). A sandwich attack could extract up to 5%.
- [x] Verify the `usdcBasePhaseOrder` overlap (`AveniaTransferToPolygon` and `AveniaSwapToUsdcBase` both at order 6; both wait phases at order 7) cannot cause incorrect phase transitions. **PASS** — routes are mutually exclusive, guarded by `if (state.winningRoute === "avenia")` / `if (state.winningRoute === "squidrouter")` checks.
- [x] Verify Base flow arrival checks are delta-based. **PASS** — Avenia BRLA, Polygon BRLA, Avenia USDC-on-Base, and SquidRouter USDC-on-Base waits all use persisted pre-action baselines plus expected deltas. Avenia BRLA transfer recovery also uses the persisted Avenia baseline before resending. Base USDC waits use the default 99.8% tolerance and persist the actual received delta before final verification.
- [x] Verify Nabla swap resume cannot lose the received BRLA amount. **PASS** — pre-swap BRLA baseline and swap hash are persisted; resume computes output from the persisted baseline or reuses already recorded output.
- [x] Verify Base low-coverage flow state/history is isolated from the high-coverage flow. **PASS** — `BrlaToUsdcBaseStateManager` uses `rebalancer_state_brla_to_usdc_base.json` while sharing the daily limit calculation.
- [x] Verify mild/moderate expensive rebalances are skipped in `auto` mode. **PASS** — projected cost is compared against the configured band threshold before any fresh Base state write or transaction.
- [x] Verify severe imbalances can execute at a higher configured cost while still respecting hard caps. **PASS** — severe uses `REBALANCING_MAX_COST_BPS_SEVERE`, bounded by `REBALANCING_HARD_MAX_COST_BPS`.
- [x] Verify `off` mode performs no fresh Base execution. **PASS** — policy returns a skip decision before quotes, state writes, balances, approvals, swaps, transfers, or tickets.
- [x] Verify `dry-run` mode performs no approvals/swaps/transfers/history mutations. **PASS** — policy quotes and logs the decision, then exits before state creation.
- [x] Verify `always` mode still enforces non-profitable daily bridge limit and hard max-cost cap. **PASS** — daily limit is checked after quote/cost-policy evaluation so profitable quotes can bypass; policy rejects cost above `REBALANCING_HARD_MAX_COST_BPS` in every mode.
- [x] Verify skipped decisions are observable. **PASS** — logs include direction, band, projected cost bps, allowed bps, input, projected output, projected cost, and reason.
