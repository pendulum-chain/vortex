# Ephemeral Accounts — Lifecycle, Funding, and Cleanup

## What This Does

Every ramp operation creates temporary blockchain accounts (ephemeral accounts) on one or more chains. These accounts hold user funds in transit as tokens move between chains during the ramp. The lifecycle is: **create → fund → use during ramp phases → clean up residual tokens and reclaim balances**. If any step in this lifecycle fails or is incomplete, user or platform funds can become permanently stuck on an ephemeral account that nobody monitors.

The cleanup process runs as a background worker (`cleanup.worker.ts`) on a 5-minute cron. After a ramp completes, chain-specific post-process handlers sweep residual tokens and reclaim native balances from the ephemeral accounts back to the platform funding accounts.

### Chains Involved

Ephemeral accounts may be created on:
- **Stellar** — For Spacewalk bridge operations and direct Stellar payments
- **Pendulum** — For Nabla swaps (Substrate-side), Spacewalk redeems, XCM transfers
- **Moonbeam** — For legacy EVM operations (historical Monerium EUR → Moonbeam path is removed; still used for ARS-Stellar off-ramp's Moonbeam→Pendulum XCM hop, Alfredpay permit acquisition, and SquidRouter swaps), XCM to/from Pendulum
- **Polygon** — (Legacy) For Monerium EURe operations; no active corridor uses Polygon anymore but the post-process handler remains for safety on any still-in-flight legacy ramps
- **AssetHub** — For XCM transfers to/from Pendulum and Hydration
- **Hydration** — For Hydration DEX swaps and XCM transfers
- **Base** — Hub for all BRL **and EUR** on/off-ramp flows. Hosts BRLA mint/burn (via Avenia), Mykobo EUR settlement (EURC on Base), Nabla-on-EVM swap (USDC↔BRLA, USDC↔EURC), and EVM fee distribution via Multicall3.

### Cleanup Architecture

Post-process handlers registered in `apps/api/src/api/services/phases/post-process/index.ts`:

- **StellarPostProcessHandler** — Submits the `stellarCleanup` XDR to merge the Stellar ephemeral account back to the funding account.
- **PendulumPostProcessHandler** — Submits the `pendulumCleanup` extrinsic to sweep Pendulum ephemeral tokens.
- **MoonbeamPostProcessHandler** — Waits 3 hours for SquidRouter refunds to land, then submits `moonbeamCleanup` to sweep Moonbeam ephemeral tokens.
- **PolygonPostProcessHandler** — (Legacy Monerium support) On Monerium-onramp BUY ramps with a `polygonCleanup` presigned tx, broadcasts the user's pre-signed `approve` and then runs `transferFrom(ephemeral, fundingAccount, balance)` from the funding key to sweep residual ERC-20 tokens. Skipped when ephemeral balance is zero. **No active corridor produces new Polygon ephemerals; this handler exists for in-flight legacy ramps and can be retired once Monerium ramps are fully drained.**
- **HydrationPostProcessHandler** — On BUY ramps with a `hydrationCleanup` presigned extrinsic, submits the cleanup extrinsic.
- **AssetHubPostProcessHandler** — Registered but inert. `shouldProcess` returns `false` unconditionally; `process` returns `[true, null]`. No on-chain action is performed. Effectively a placeholder for future AssetHub cleanup.

A post-process handler is registered for **Base** (`BaseChainPostProcessHandler`). After a Base-routed ramp completes (BRL via BRLA or EUR via Mykobo), it sweeps residual BRLA, EURC, USDC, and AxlUSDC dust from the Base ephemeral to the funding account via the standard `approve(funding, MAX_UINT256)` + `transferFrom(ephemeral, funding, balance)` pattern (presigned by the ephemeral; `transferFrom` broadcast by the funding key). Per-token balance checks skip the sweep when the balance is zero. ETH gas dust on the ephemeral is not swept (accepted residual; gas is funded just-in-time and rarely accumulates meaningfully).

The cleanup worker (`cleanup.worker.ts`) selects ramps where `currentPhase ∈ {"complete", "failed", "timedOut"}` and cleanup is not yet completed, processing up to 5 ramps per cycle on a 5-minute cron. There is no longer a SEPA exclusion (the historical `from: { [Op.ne]: "sepa" }` filter has been removed).

## Security Invariants

1. **Every funded ephemeral account MUST be cleaned up after ramp completion** — Residual tokens on an ephemeral account represent trapped value. Cleanup must run for every chain that held funds.
2. **Cleanup MUST cover ALL chains that an ephemeral account was funded on** — If a ramp touched Stellar, Pendulum, Moonbeam, Polygon, AssetHub, and Hydration, all six must have cleanup handlers.
3. **Failed and timed-out ramps MUST have a cleanup path** — If a ramp fails mid-execution (e.g., after funding the ephemeral account but before completing the swap), the funds on the ephemeral account must be recoverable.
4. **The cleanup worker MUST NOT skip ramp categories silently** — If a ramp type is excluded from cleanup (e.g., SEPA), the exclusion must be justified and the funds must be recoverable through another mechanism.
5. **Cleanup transactions MUST be submitted with the server's cosigner authority** — The ephemeral account's keypair is generated client-side and may not be available post-ramp. Cleanup relies on the server's cosigner (SetOptions on Stellar, multisig on Substrate) to authorize the sweep.
6. **The Moonbeam 3-hour delay MUST be enforced before cleanup** — SquidRouter cross-chain swaps can trigger refunds via Axelar. Cleaning up before refunds land means the refunded tokens are sent to an account nobody controls.
7. **Cleanup failures MUST be logged and retried** — A single cleanup failure should not cause permanent fund loss. The worker should re-attempt on subsequent cycles.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Stuck funds on failed ramp** | Ramp fails after `fundEphemeral` but before any swap executes. Tokens sit on ephemeral Pendulum account. | The cleanup worker selects on `currentPhase ∈ {"complete", "failed", "timedOut"}`, so failed/timed-out ramps with funded ephemerals on Stellar/Pendulum/Moonbeam/Polygon/Hydration are picked up by their respective post-process handlers. F-044 is therefore largely addressed at the worker-selection level; per-chain coverage gaps (no Base handler, AssetHub no-op stub) remain. |
| **Stuck ERC-20 dust on Base** | BRL on/off-ramps could leave BRLA/USDC residuals on the Base ephemeral. | **Mitigated.** `BaseChainPostProcessHandler` sweeps both BRLA and USDC after `currentPhase === "complete"` via presigned `approve` + funding-key `transferFrom`. ETH gas dust is not swept. |
| **No-op AssetHub cleanup** | An AssetHub ephemeral holds residual tokens after an AssetHub-routed ramp. The registered `AssetHubPostProcessHandler` always returns `shouldProcess=false`. | **Known gap.** The handler is a placeholder. If AssetHub ephemerals can hold residual tokens, this needs to be implemented; otherwise the handler can be removed and the gap accepted. |
| **SEPA ramp exclusion (historical)** | An older revision of the worker excluded `from: "sepa"` from cleanup. If still in place, residual Monerium EURe on the Polygon ephemeral from a failed SEPA onramp would be unrecoverable. | **No longer exclusionary.** The `cleanup.worker.ts` query no longer filters on `from`; SEPA ramps are now eligible. The PolygonPostProcessHandler runs against them and sweeps any user-approved residual via `transferFrom`. F-046 is therefore resolved by the worker change. |
| **Premature Moonbeam cleanup** | Cleanup runs before the 3-hour SquidRouter refund window expires. Refunded tokens land on an already-swept ephemeral account. | MoonbeamPostProcessHandler enforces `MOONBEAM_CLEANUP_DELAY_MS` (3 hours). Verify this delay is checked before every Moonbeam cleanup, not just on first attempt. |
| **Ephemeral key loss** | Client generates the ephemeral keypair, but if the client disconnects or loses the key before cleanup, the server needs cosigner authority to sweep. If cosigner was never set (see F-040), cleanup is impossible. | Ensure SetOptions/multisig setup is validated at registration time. Server cosigner must be confirmed before the ramp starts. |
| **Cleanup worker saturation** | A burst of completed ramps overwhelms the worker (only 5 per cycle). Stale ramps accumulate. | Current mitigation: 5 ramps × every 5 minutes = 60 ramps/hour. Monitor queue depth. If insufficient, increase batch size or add a secondary worker. |

## Audit Checklist

- [x] **F-044 (largely resolved at worker layer)**: `cleanup.worker.ts` selects `currentPhase ∈ {"complete", "failed", "timedOut"}`. Failed/timed-out ramps are now eligible for cleanup wherever a post-process handler exists for the chain. Per-chain coverage gaps remain (no Base handler; AssetHub no-op).
- **F-045 / F-NEW-05 (resolved)**: A `BaseChainPostProcessHandler` is now registered alongside Polygon and Hydration. It sweeps BRLA and USDC residuals from Base ephemerals after the ramp completes. ETH gas dust on Base ephemerals remains unswept (intentional).
- [x] **F-046 (resolved)**: SEPA exclusion (`from: "sepa"`) is no longer present in the cleanup worker query. SEPA ramps now flow through normal post-processing.
- [x] StellarPostProcessHandler submits `stellarCleanup` XDR from ramp state — verified
- [x] PendulumPostProcessHandler submits `pendulumCleanup` extrinsic from ramp state — verified
- [x] MoonbeamPostProcessHandler enforces 3-hour delay before cleanup (`MOONBEAM_CLEANUP_DELAY_MS`) — verified
- [x] PolygonPostProcessHandler broadcasts the user-presigned `approve` and runs `transferFrom(ephemeral, fundingAccount, balance)` from `getEvmFundingAccount(Polygon)` — verified (`polygon-post-process-handler.ts:36-83`)
- [x] HydrationPostProcessHandler submits `hydrationCleanup` extrinsic from ramp state — verified
- [ ] **AssetHubPostProcessHandler is a no-op stub** (`shouldProcess` always returns `false`). Either implement an AssetHub cleanup or remove the handler from the registry.
- [x] **Base post-process handler implemented** (`BaseChainPostProcessHandler`). Sweeps residual BRLA/USDC/EURC/AxlUSDC on Base ephemerals to the funding account via presigned `approve` + funding-key `transferFrom`. ETH gas dust is not swept (accepted residual).
- [x] Cleanup worker runs every 5 minutes via `node-cron` — verified
- [x] Cleanup worker processes at most 5 ramps per cycle — verified
- [x] Cleanup worker marks ramps as cleaned (`postProcessDone: true` via `postCompleteState.cleanup.cleanupCompleted`) to prevent re-processing — verified
- [x] Base post-process handler catches errors per-chain and does not let one chain's failure block others — verified (each handler's `process` returns `[success, error]` and the worker `Promise.allSettled`s them)
- [EXISTING FINDING] **F-051**: No Slack alerting or monitoring notification for cleanup failures — silent fund trapping risk.
- [EXISTING FINDING] **F-052**: No admin endpoint to manually trigger cleanup for a specific ramp ID.
- [EXISTING FINDING] **F-057**: `destinationTransfer` handler sends presigned tx without validating destination address — combined with F-050, no destination validation exists in the ephemeral-to-user transfer path.
