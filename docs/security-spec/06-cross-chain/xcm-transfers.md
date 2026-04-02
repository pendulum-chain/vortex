# XCM Transfers

## What This Does

XCM (Cross-Consensus Messaging) is the inter-parachain transfer protocol used to move tokens between Polkadot parachains. Vortex uses XCM transfers across four chains: **Pendulum**, **Moonbeam**, **AssetHub**, and **Hydration**. These transfers are integral to both on-ramp and off-ramp flows — they shuttle tokens between chains where swaps, bridging, or final settlement occur.

**Chains involved:** Pendulum, Moonbeam (EVM parachain), AssetHub (Polkadot system chain), Hydration (DEX parachain)

**Phase handlers:**
- `moonbeam-to-pendulum-xcm-handler.ts` — XCM from Moonbeam to Pendulum using RPC submission with shuffle-based retry
- `moonbeam-to-pendulum-handler.ts` — Calls `executeXCM` on the Moonbeam receiver contract using the executor private key, waits for hash registration
- `pendulum-to-moonbeam-xcm-handler.ts` — XTokens transfer from Pendulum to Moonbeam with 3-tier recovery
- `pendulum-to-assethub-phase-handler.ts` — XTokens from Pendulum to AssetHub
- `pendulum-to-hydration-xcm-phase-handler.ts` — XTokens from Pendulum to Hydration, waits for balance arrival
- `hydration-swap-handler.ts` — Executes a presigned swap on Hydration DEX
- `hydration-to-assethub-xcm-phase-handler.ts` — XCM from Hydration to AssetHub, skips finalization

**Key patterns across all handlers:**
- Presigned transactions are decoded from stored state and submitted from ephemeral accounts
- Recovery logic checks whether a prior attempt already succeeded before re-submitting
- Balance polling is used to confirm token arrival on the destination chain
- Phase transitions are returned to the processor, never directly mutated

## Security Invariants

1. **Moonbeam→Pendulum XCM MUST use RPC shuffling on retry** — `moonbeam-to-pendulum-xcm-handler.ts` maintains a `submittedToRpcIndexes` array per ramp. On retry, it selects a different RPC node. When all RPCs are exhausted, it throws `RecoverablePhaseError` with a 30-minute wait to allow chain recovery.
2. **Moonbeam receiver contract `executeXCM` MUST only be callable by the executor key** — `moonbeam-to-pendulum-handler.ts` uses `MOONBEAM_EXECUTOR_PRIVATE_KEY` to call the receiver contract. This key is a server-side secret; the call cannot be forged by clients.
3. **Moonbeam receiver contract flow MUST verify hash registration before XCM** — The handler first waits for `getHashRegistered()` to return `true` for the pending nonce, confirming the split receiver contract has recorded the expected parameters. Only then does it call `executeXCM`.
4. **Pendulum→Moonbeam XCM MUST use 3-tier recovery** — (a) If transaction hash is stored, check Pendulum for success. (b) If tokens already left Pendulum, wait for Moonbeam arrival. (c) Only submit fresh if neither condition is met. This prevents double-XCM.
5. **Pendulum→Moonbeam MUST verify Moonbeam arrival with a 2-minute timeout** — After XCM submission, the handler polls the Moonbeam ephemeral balance. Timeout throws a recoverable error for retry.
6. **Hydration→AssetHub XCM MUST NOT wait for finalization** — `submitExtrinsic` is called with `waitForFinalization=false` because finalization does not work on Hydration. The handler proceeds after inclusion. **This means the transfer can theoretically be reverted by a chain reorganization.**
7. **Hydration→AssetHub MUST use nonce-based re-execution detection** — If `currentNonce > executeNonce`, the handler skips re-submission and transitions directly to `complete`.
8. **Hydration swap MUST use a presigned transaction** — The swap extrinsic is presigned at ramp creation and stored. The handler decodes and submits it. Server cannot modify swap parameters at execution time.
9. **All XCM handlers MUST treat already-executed transfers as success, not error** — Re-execution detection (nonce checks, balance checks, hash checks) must transition forward, never re-submit.
10. **Moonbeam→Pendulum handler retry loop MUST be bounded** — The handler retries `executeXCM` up to 5 attempts with 20-second delays. After exhaustion, the error propagates to the phase processor for higher-level retry.

## Threat Vectors & Mitigations

| Threat | Mitigation |
|---|---|
| **Double XCM submission** — Crash after XCM sent but before phase transition causes re-execution on retry | Multi-tier recovery in all handlers: check transaction hash, check source balance depletion, check destination balance arrival before re-submitting. |
| **RPC node failure during Moonbeam→Pendulum** — Single RPC failure blocks the transfer | RPC shuffling: each retry uses a different RPC node. After all RPCs exhausted, 30-minute cooldown allows infrastructure recovery. |
| **Moonbeam receiver contract called with wrong parameters** — Executor key misused to call `executeXCM` with attacker-controlled parameters | The handler reads parameters from the stored ramp state (set at creation time). The executor key is server-side only. An attacker would need server compromise to manipulate the call. |
| **Hydration chain reorganization after non-finalized XCM** — Transfer included but reverted due to chain reorg | **KNOWN RISK**: No mitigation. Finalization is explicitly skipped ("doesn't work on Hydration"). A reorg could result in the ramp transitioning to `complete` while the XCM transfer was actually reverted. Probability depends on Hydration's block finality characteristics. |
| **Moonbeam→Pendulum blind retry loop** — 5 attempts × 20s delay = 100s of repeated contract calls that may all fail | After 5 attempts, the error propagates to the phase processor, which has its own retry budget (8 retries). Total retry surface is 5 × 8 = 40 attempts across all phase processor cycles. |
| **Balance polling false positive** — Token balance on destination matches expected amount due to unrelated deposit | Ephemeral accounts are single-use, so unrelated deposits are unlikely. However, if the ephemeral receives tokens from another source during the same ramp, the balance check cannot distinguish them. |
| **Nonce desync across chains** — Nonce used for re-execution detection is read from a stale state | Nonces are read from on-chain state at execution time (`getTransactionCount` / API queries), not from cached values. |
| **`MOONBEAM_EXECUTOR_PRIVATE_KEY` compromise** — Attacker can call `executeXCM` on the receiver contract | Receiver contract should validate that the caller is the authorized executor. If it does, compromise of the key allows XCM execution with arbitrary parameters. Scope of damage depends on what the receiver contract permits. |

## Audit Checklist

- [x] Verify `moonbeam-to-pendulum-xcm-handler.ts` RPC shuffling: `submittedToRpcIndexes` is persisted in ramp state across retries and correctly excludes already-tried RPCs. **PASS** — RPC index array persisted in ramp state.
- [x] Verify `RecoverablePhaseError` with `minimumWaitSeconds: 1800` (30 min) is thrown when all RPCs are exhausted. **PASS** — 30-minute wait confirmed when all RPCs tried.
- [x] Verify `moonbeam-to-pendulum-handler.ts` waits for `getHashRegistered()` before calling `executeXCM`. **PASS** — hash registration check precedes XCM execution.
- [x] Verify `MOONBEAM_EXECUTOR_PRIVATE_KEY` is used correctly — not leaked in logs, not passed to clients. **PASS** — key used only for signing; no log leakage found.
- [PARTIAL] Verify the Moonbeam receiver contract's `executeXCM` function validates the caller is the authorized executor (on-chain check, not just client-side). **PARTIAL** — cannot verify on-chain contract logic from application code alone; requires separate on-chain audit.
- [x] Verify `pendulum-to-moonbeam-xcm-handler.ts` 3-tier recovery: (a) hash check → (b) token departure check → (c) fresh submit, in that order. **PASS** — 3-tier recovery logic confirmed in correct order.
- [x] Verify Moonbeam balance polling uses a 2-minute timeout and throws recoverable error on expiry. **PASS** — 2-minute timeout with recoverable error confirmed.
- [x] **FINDING**: `hydration-to-assethub-xcm-phase-handler.ts` explicitly passes `false` for finalization wait — verify this is an accepted risk and document the reorg window. **PASS (accepted risk)** — finalization skip is intentional due to Hydration limitations; documented as known risk.
- [FAIL] Verify Hydration nonce re-execution guard: `currentNonce > executeNonce` correctly identifies a previously-executed transfer. **FAIL F-028** — nonce mismatch is logged as warning only; execution is NOT blocked. A stale nonce could cause re-execution.
- [x] Verify `hydration-swap-handler.ts` uses the presigned extrinsic from state — not constructed at execution time. **PASS** — extrinsic decoded from stored presigned hex.
- [x] Verify `pendulum-to-assethub-phase-handler.ts` transitions to `complete` — confirm this is the correct terminal phase for its flow. **PASS** — transitions to `complete` as expected.
- [x] Verify `pendulum-to-hydration-xcm-phase-handler.ts` waits for balance arrival on Hydration before transitioning to `hydrationSwap`. **PASS** — balance polling confirmed before phase transition.
- [x] Verify no XCM handler logs private keys, seeds, or full transaction payloads that could expose sensitive data. **PASS** — no sensitive data in logs.
- [PARTIAL] Verify `moonbeam-to-pendulum-handler.ts` blind retry (5 attempts, 20s delay) does not consume the phase processor's retry budget — each handler invocation counts as one phase processor attempt. **PARTIAL F-028** — the 5-attempt internal retry uses stale gas prices from initial fetch; no gas price refresh between retries.
