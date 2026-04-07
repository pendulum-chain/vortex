# Ephemeral Accounts — Lifecycle, Funding, and Cleanup

## What This Does

Every ramp operation creates temporary blockchain accounts (ephemeral accounts) on one or more chains. These accounts hold user funds in transit as tokens move between chains during the ramp. The lifecycle is: **create → fund → use during ramp phases → clean up residual tokens and reclaim balances**. If any step in this lifecycle fails or is incomplete, user or platform funds can become permanently stuck on an ephemeral account that nobody monitors.

The cleanup process runs as a background worker (`cleanup.worker.ts`) on a 5-minute cron. After a ramp completes, chain-specific post-process handlers sweep residual tokens and reclaim native balances from the ephemeral accounts back to the platform funding accounts.

### Chains Involved

Ephemeral accounts may be created on:
- **Stellar** — For Spacewalk bridge operations and direct Stellar payments
- **Pendulum** — For Nabla swaps, Spacewalk redeems, XCM transfers
- **Moonbeam** — For EVM operations, SquidRouter swaps, XCM to/from Pendulum
- **Polygon** — For Monerium EURe operations
- **AssetHub** — For XCM transfers to/from Pendulum and Hydration
- **Hydration** — For Hydration DEX swaps and XCM transfers

### Cleanup Architecture

Three post-process handlers exist:
- **StellarPostProcessHandler** — Submits the `stellarCleanup` XDR to merge the Stellar ephemeral account back to the funding account.
- **PendulumPostProcessHandler** — Submits the `pendulumCleanup` extrinsic to sweep Pendulum ephemeral tokens.
- **MoonbeamPostProcessHandler** — Waits 3 hours for SquidRouter refunds to land, then submits `moonbeamCleanup` to sweep Moonbeam ephemeral tokens.

The cleanup worker queries for ramps with `currentPhase: "complete"`, excluding SEPA (`from: { [Op.ne]: "sepa" }`), and processes up to 5 ramps per cycle.

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
| **Stuck funds on failed ramp** | Ramp fails after `fundEphemeral` but before any swap executes. Tokens sit on ephemeral Pendulum account. Cleanup worker only processes `complete` ramps, so these tokens are never recovered. | **OPEN (F-044)**: Extend cleanup worker to process `failed` and timed-out ramps. Add cleanup handlers that detect which phase the ramp reached and sweep accordingly. |
| **Stuck funds on Polygon/Hydration/AssetHub** | Ramp completes with tokens remaining on Polygon (Monerium EURe dust), Hydration, or AssetHub ephemeral accounts. No post-process handler exists for these chains. | **OPEN (F-045)**: Implement post-process handlers for Polygon, Hydration, and AssetHub. |
| **SEPA ramp exclusion** | SEPA onramp ramps are explicitly excluded from cleanup. If Monerium mints EURe to the ephemeral Polygon account but the ramp fails, those EURe tokens are trapped. | **OPEN (F-046)**: Evaluate whether SEPA ramps can leave residual tokens. If so, remove the exclusion or add a SEPA-specific cleanup handler. |
| **Premature Moonbeam cleanup** | Cleanup runs before the 3-hour SquidRouter refund window expires. Refunded tokens land on an already-swept ephemeral account. | MoonbeamPostProcessHandler enforces `MOONBEAM_CLEANUP_DELAY_MS` (3 hours). Verify this delay is checked before every Moonbeam cleanup, not just on first attempt. |
| **Ephemeral key loss** | Client generates the ephemeral keypair, but if the client disconnects or loses the key before cleanup, the server needs cosigner authority to sweep. If cosigner was never set (see F-040), cleanup is impossible. | Ensure SetOptions/multisig setup is validated at registration time. Server cosigner must be confirmed before the ramp starts. |
| **Cleanup worker saturation** | A burst of completed ramps overwhelms the worker (only 5 per cycle). Stale ramps accumulate. | Current mitigation: 5 ramps × every 5 minutes = 60 ramps/hour. Monitor queue depth. If insufficient, increase batch size or add a secondary worker. |

## Audit Checklist

- [EXISTING FINDING] **F-044**: Cleanup worker only processes `currentPhase: "complete"`. Failed/timed-out ramps with funded ephemeral accounts are never cleaned up.
- [EXISTING FINDING] **F-045**: No post-process handler exists for Polygon, Hydration, or AssetHub chains. Residual tokens on these chains have no cleanup mechanism.
- [EXISTING FINDING] **F-046**: SEPA onramp ramps (`from: "sepa"`) are explicitly excluded from cleanup. Residual tokens from failed SEPA ramps may be unrecoverable.
- [x] StellarPostProcessHandler submits `stellarCleanup` XDR from ramp state — verified
- [x] PendulumPostProcessHandler submits `pendulumCleanup` extrinsic from ramp state — verified
- [x] MoonbeamPostProcessHandler enforces 3-hour delay before cleanup (`MOONBEAM_CLEANUP_DELAY_MS`) — verified
- [x] Cleanup worker runs every 5 minutes via `node-cron` — verified
- [x] Cleanup worker processes at most 5 ramps per cycle — verified
- [x] Cleanup worker marks ramps as cleaned (`postProcessDone: true`) to prevent re-processing — verified
- [x] Base post-process handler catches errors per-chain and does not let one chain's failure block others — verified
- [EXISTING FINDING] **F-051**: No Slack alerting or monitoring notification for cleanup failures — silent fund trapping risk.
- [EXISTING FINDING] **F-052**: No admin endpoint to manually trigger cleanup for a specific ramp ID.
