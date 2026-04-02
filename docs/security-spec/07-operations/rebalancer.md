# Rebalancer

## What This Does

The rebalancer is a standalone service (`apps/rebalancer/`) that monitors token coverage ratios on Pendulum and automatically moves liquidity across chains when ratios fall below threshold. Its primary function is ensuring the platform has sufficient tokens on Pendulum to service ramp operations without manual intervention.

**Current implementation:** One rebalancing path — BRLA ↔ axlUSDC, an 8-step cross-chain process that moves value from one stablecoin pool to another.

**Architecture:**
- `index.ts` — Entry point: checks coverage ratios, triggers rebalancing if any ratio falls below 25% (`COVERAGE_RATIO_THRESHOLD`)
- `rebalance/brla-to-axlusdc/index.ts` — Orchestrator: manages an 8-step state machine with persistence and resumability
- `rebalance/brla-to-axlusdc/steps.ts` — Individual step implementations (swaps, XCMs, API calls)
- `services/stateManager.ts` — State persistence via Supabase Storage (JSON file, not database)
- `utils/config.ts` — Configuration and secret loading

**Rebalancing flow (BRLA → axlUSDC):**
1. Swap axlUSDC → BRLA on Pendulum (Nabla DEX)
2. XCM BRLA from Pendulum → Moonbeam
3. Call BRLA API to swap BRLA → USDC (off-chain settlement via BRLA provider)
4. Wait for USDC arrival on Polygon
5. SquidRouter swap: USDC on Polygon → axlUSDC on Moonbeam
6. XCM axlUSDC from Moonbeam → Pendulum
7. Verify arrival on Pendulum
8. Clean up state

**Key secrets:** Three separate chain private keys: `PENDULUM_ACCOUNT_SECRET`, `MOONBEAM_ACCOUNT_SECRET`, `POLYGON_ACCOUNT_SECRET`. These are **distinct from the API service keys** — the rebalancer operates its own accounts.

## Security Invariants

1. **Coverage ratio check MUST precede rebalancing** — The rebalancer only triggers when a token's coverage ratio falls below `COVERAGE_RATIO_THRESHOLD` (default 0.25 / 25%). It must never rebalance preemptively or based on stale data.
2. **State persistence MUST survive process restarts** — The `stateManager` writes state to Supabase Storage as a JSON file. On restart, the rebalancer reads this file and resumes from the last completed step.
3. **Each step MUST be idempotent or guarded against re-execution** — If the process crashes mid-step and resumes, re-executing a completed step must not cause double-swaps, double-XCMs, or double-settlements.
4. **Rebalancer private keys MUST be isolated from API service keys** — The three chain keys are used only for rebalancer operations. Compromise of rebalancer keys should not affect API ramp operations, and vice versa.
5. **BRLA business account address MUST be verified** — `brlaBusinessAccountAddress` has a hardcoded default (`0xDF5Fb34B90e5FDF612372dA0c774A516bF5F08b2`). If this address is wrong, funds are sent to the wrong recipient with no recovery.
6. **Slippage MUST be bounded** — The Nabla swap step uses a 5% slippage tolerance (hardcoded). Excessive slippage could result in significant value loss per rebalance.
7. **SquidRouter gas pricing MUST not overpay excessively** — `gasMultiplier * 5n` is applied to `maxFeePerGas` for SquidRouter transactions. This aggressive multiplier ensures inclusion but could result in significant gas overpayment.
8. **Concurrent rebalancer executions MUST NOT corrupt state** — If two rebalancer instances run simultaneously, both would read the same state file and potentially execute the same steps in parallel.

## Threat Vectors & Mitigations

| Threat | Mitigation |
|---|---|
| **⚠️ State file corruption from concurrent execution** — Two rebalancer instances read the same JSON file from Supabase Storage, both decide to rebalance, both execute steps simultaneously | **NO MITIGATION.** Supabase Storage has no file locking, no atomic compare-and-swap, no conditional writes. If the rebalancer is deployed as multiple instances or triggered concurrently, state corruption and double-execution are possible. |
| **Rebalancer key compromise** — Attacker obtains one or more of the three chain private keys | Full drain of the rebalancer's accounts on the compromised chain(s). These are pooled accounts holding liquidity. No rate limiting at the chain level. The API service accounts are separate, so ramp operations are not directly affected (but liquidity would be depleted). |
| **BRLA API manipulation** — The BRLA API returns a manipulated exchange rate for the BRLA→USDC swap | The rebalancer trusts the BRLA API response. No independent price verification is performed. A manipulated rate could result in receiving far less USDC than the BRLA value. |
| **SquidRouter route manipulation** — SquidRouter API returns a malicious route for the USDC→axlUSDC swap | Same trust issue as with the BRLA API. The rebalancer trusts the route. No output verification against expected amounts. |
| **Hardcoded business account address** — `brlaBusinessAccountAddress` default is wrong or points to an attacker-controlled address | Funds would be sent to the wrong address. The address should be verified against BRLA's official documentation and set via environment variable, not hardcoded. |
| **5% slippage exploitation** — An attacker manipulates the Nabla DEX pool to extract up to 5% per rebalance via sandwich attacks | 5% slippage tolerance is generous. For large rebalancing amounts, this could be significant. No MEV protection on Pendulum (though parachain MEV is less prevalent than Ethereum). |
| **State file deletion or corruption** — Supabase Storage file is deleted or corrupted manually | The rebalancer would lose track of in-progress operations. Steps that already executed (swaps, XCMs) would not be resumed, and the rebalancer would start fresh. This could leave funds stranded mid-flow. |
| **Stale coverage ratio** — The coverage ratio is checked once at startup, but by the time the 8-step rebalance completes, the ratio may have changed significantly | No re-check between steps. The rebalance amount is calculated upfront. If conditions change during the multi-step process, the rebalance may be unnecessary or insufficient. |

## Audit Checklist

- [ ] **FINDING**: State stored as JSON file in Supabase Storage — no locking, no atomic updates. Verify whether concurrent rebalancer instances are possible in the deployment configuration.
- [ ] **FINDING**: `brlaBusinessAccountAddress` has hardcoded default `0xDF5Fb34B90e5FDF612372dA0c774A516bF5F08b2` — verify this is the correct BRLA business account and that it's set via environment variable in production
- [ ] **FINDING**: 5% slippage tolerance hardcoded in Nabla swap — verify this is acceptable for expected rebalancing amounts
- [ ] **FINDING**: `gasMultiplier * 5n` applied to `maxFeePerGas` — verify this doesn't cause excessive gas overpayment in production
- [ ] Verify `COVERAGE_RATIO_THRESHOLD` default (0.25) is appropriate for the expected token volumes
- [ ] Verify the three rebalancer private keys (`PENDULUM_ACCOUNT_SECRET`, `MOONBEAM_ACCOUNT_SECRET`, `POLYGON_ACCOUNT_SECRET`) are distinct from all API service keys
- [ ] Verify step idempotency: can each of the 8 steps be safely re-executed after a crash? Check for nonce guards, balance checks, or transaction hash verification
- [ ] Verify the BRLA→USDC swap (step 3) validates the received USDC amount against expectations
- [ ] Verify the SquidRouter swap (step 5) validates the received axlUSDC amount against expectations
- [ ] Verify Supabase Storage write errors are handled — what happens if state cannot be persisted after a step completes?
- [ ] Verify the rebalancer has monitoring/alerting for: failed steps, insufficient balances, stuck state
- [ ] Verify no rebalancer secrets are logged (check all error handlers and debug logging)
- [ ] Check whether the rebalancer runs on a schedule (cron) or is triggered manually — determines concurrency risk
- [ ] Verify the `stateManager` handles missing or corrupted state files gracefully (fresh start vs crash)
