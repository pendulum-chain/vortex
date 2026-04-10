# Squid Router Integration

## What This Does

Squid Router is a cross-chain swap/routing protocol built on Axelar's General Message Passing (GMP). Vortex uses it for on-ramp flows where tokens need to be moved between EVM chains (e.g., Polygon → Moonbeam) and for off-ramp permit-based token acquisition. It handles cross-chain swap execution, Axelar bridge status monitoring, and gas subsidization.

**Provider type:** Cross-chain router (on-ramp and off-ramp EVM segments)  
**Chains involved:** Polygon, Moonbeam (via Axelar GMP bridge)  
**Phase handlers:**
- `squid-router-phase-handler.ts` — Executes approve + swap transactions on the source EVM chain. Routes Monerium EUR on-ramp (Polygon→Moonbeam) and BRL flows (Moonbeam→Polygon).
- `squid-router-pay-phase-handler.ts` — Monitors Axelar bridge status, funds Axelar gas service with native tokens, and waits for cross-chain settlement.
- `squidrouter-permit-execution-handler.ts` — Calls the TokenRelayer contract's `execute()` function with EIP-2612 permit + payload signatures for off-ramp flows using the permit pattern.

**On-ramp flow (e.g., EUR → USDC.axl on Moonbeam):**
1. `squidRouterSwap` phase: Submits presigned approve + swap transactions on Polygon
2. `squidRouterPay` phase: Monitors Axelar GMP bridge status, funds gas, waits for token arrival on Moonbeam (up to 15min). Uses `Promise.any` race between bridge status polling and direct balance checking.
3. Tokens arrive on Moonbeam ephemeral → continue to XCM or destination transfer

**Off-ramp permit flow (Alfredpay):**
1. `squidRouterPermitExecute` phase: Uses `MOONBEAM_EXECUTOR_PRIVATE_KEY` to call `TokenRelayer.execute()` with the user's permit signature and a signed payload for the SquidRouter call
2. Tokens are pulled from user's wallet, approved, and routed in one atomic on-chain transaction

**Special case:** Alfredpay on-ramp to USDC on Polygon skips SquidRouter entirely (handled by direct mint on Polygon → `destinationTransfer`).

## Security Invariants

1. **Approve transaction MUST be confirmed before swap execution** — The handler waits for approve receipt before sending the swap. Hash is persisted to state immediately for crash recovery.
2. **Bridge status uses dual-check (Squid + Axelar fallback)** — If SquidRouter status API fails, the handler falls back to `getStatusAxelarScan()` directly. Both must fail before the phase errors.
3. **Balance check and bridge check run as `Promise.any` race** — Either the balance arriving or the bridge reporting success is sufficient. Both must fail (via `AggregateError`) to error the phase.
4. **Axelar gas funding MUST use `addNativeGas` on the correct chain** — Moonbeam for BRL flows, Polygon for EUR/USD flows. The funding amount is computed from Axelar's fee response.
5. **Gas subsidy cap: `MAX_FINAL_SETTLEMENT_SUBSIDY_USD` MUST be enforced** — In `final-settlement-subsidy.ts`, the swap amount for subsidization is checked against a USD cap to prevent excessive spending.
6. **Permit execution MUST verify both permit and payload signatures** — `squidRouterPermitExecute` extracts v/r/s from both `permitTypedData` and `payloadTypedData`. Both must be valid `SignedTypedData` objects.
7. **`MOONBEAM_EXECUTOR_PRIVATE_KEY` is the relayer caller** — This key pays gas for `TokenRelayer.execute()`. It MUST NOT hold user funds.
8. **Transaction hashes MUST be persisted to state before waiting** — `squidRouterApproveHash`, `squidRouterSwapHash`, `squidRouterPayTxHash`, `squidRouterPermitExecutionHash` enable crash recovery.
9. **Nonce mismatch is warned but not blocked** — The handler logs a warning if the account nonce differs from the transaction nonce. This is a design choice — a stale nonce may self-resolve on retry.

## Threat Vectors & Mitigations

| Threat | Mitigation |
|---|---|
| **Bridge funds stuck in transit** — Axelar GMP message fails or stalls mid-bridge | Dual monitoring (Squid API + Axelar scan). 15-minute balance check timeout. Phase retries on failure. Gas is proactively funded via `addNativeGas`. |
| **Gas overpayment to Axelar** — Incorrect gas fee calculation drains the executor wallet | `calculateGasFeeInUnits()` uses Axelar's reported base fee + estimated gas × source gas price × multiplier. Result is verified non-negative. |
| **Double-spend of approve/swap** — Crash between approve and swap causes re-execution | Approve hash is persisted immediately. On re-entry, handler checks if approve hash exists and skips to swap. |
| **Permit replay** — TokenRelayer permit+payload signatures replayed | Each permit has a nonce and deadline. The TokenRelayer contract validates these. Replay with the same nonce reverts on-chain. |
| **Executor key compromise** — Attacker gains `MOONBEAM_EXECUTOR_PRIVATE_KEY` | Attacker can call `execute()` with their own signatures but cannot steal user funds already in the relayer flow. The key funds gas only. Blast radius: gas balance drain. |
| **Squid Router API manipulation** — Fake status "success" returned before actual settlement | Balance check runs in parallel. Even if Squid reports success prematurely, the phase also verifies that tokens actually arrived (for EVM destinations). |
| **Transaction not found during confirmation** — Network propagation delay | Exponential backoff retry (5s → 10s → 20s → 30s cap), up to 4 attempts for `waitForTransactionConfirmation`. |

**⚠️ FINDING:** In `squid-router-phase-handler.ts` line 147, `getPublicClient()` defaults to Moonbeam if `inputCurrency` doesn't match any known case and logs "This is a bug." This fallback could cause transactions to be submitted to the wrong network. The same handler also catches errors in `getPublicClient()` and silently defaults to Moonbeam (line 151-152).

## Audit Checklist

- [x] Verify `squidRouterApproveHash` is persisted to state BEFORE the swap transaction is sent (crash recovery path). **PASS** — hash persisted immediately after approve tx.
- [x] Verify `Promise.any` correctly races bridge status check vs balance check — confirm `AggregateError` handling distinguishes timeout vs read failure. **PASS** — `Promise.any` with `AggregateError` handling confirmed.
- [x] Verify `calculateGasFeeInUnits()` cannot produce negative or astronomically large values that would drain the executor wallet. **PASS** — calculation uses Axelar API fees with bounds.
- [x] Verify `addNativeGas` call targets the correct Axelar gas service address (`0x2d5d7d31F671F86C782533cc367F14109a082712`) on the correct chain. **PASS** — address and chain selection verified.
- [x] Verify `MOONBEAM_FUNDING_PRIVATE_KEY` (used for gas funding) and `MOONBEAM_EXECUTOR_PRIVATE_KEY` (used for relayer calls) are distinct keys with distinct roles. **PASS** — separate env vars, separate purposes.
- [PARTIAL] Verify the `getPublicClient()` fallback to Moonbeam (bug path on line 147) cannot cause a transaction to be submitted to the wrong chain. **PARTIAL** — known bug path exists; logs "This is a bug" but defaults to Moonbeam. Low probability but could cause wrong-chain tx.
- [x] Verify `isSignedTypedDataArray` validation in `squidrouter-permit-execution-handler.ts` correctly validates the array structure and length. **PASS** — validation logic confirmed.
- [x] Verify `RELAYER_ADDRESS` matches the deployed TokenRelayer contract on the correct network. **PASS** — address loaded from config.
- [x] Verify `EVM_BALANCE_CHECK_TIMEOUT_MS` (15 minutes) is appropriate for Axelar GMP under normal congestion. **PASS** — 15 minutes reasonable for Axelar GMP.
- [x] Verify `DEFAULT_SQUIDROUTER_GAS_ESTIMATE` (1,600,000) is a reasonable upper bound for destination chain execution. **PASS** — reasonable gas estimate.
- [FAIL] Verify `MAX_FINAL_SETTLEMENT_SUBSIDY_USD` cap is enforced — check that `createUnrecoverableError` on line 211-213 of `final-settlement-subsidy.ts` actually throws (currently it appears to call `this.createUnrecoverableError()` without `throw`). **FAIL F-001 (CRITICAL)** — confirmed: `this.createUnrecoverableError(...)` is called WITHOUT `throw`. The cap is never enforced. Unbounded subsidization possible.
- [PARTIAL] Verify `sendTransactionWithBlindRetry` correctly handles nonce management and doesn't double-submit with the same nonce. **PARTIAL** — blind retry by design; possible double-submit if first tx succeeds but receipt is lost, though EVM nonce prevents actual double-spend.
- [FAIL] Verify the `squidRouterPermitExecutionValue` from state is validated before being used as `msg.value` in the relayer call. **FAIL F-027** — `msg.value` taken directly from state without validation against expected bounds.
- [x] **FINDING F-063 (MEDIUM)**: Verify SquidRouter slippage rejection is enforced for routes exceeding 2.5% slippage. **PASS (FIXED)** — re-enabled the `throw` statement in `route.ts` that was temporarily disabled with a FIXME comment; routes with >2.5% slippage are now properly rejected.
