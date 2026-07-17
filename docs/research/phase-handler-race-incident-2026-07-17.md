# Phase-handler race incident report — 2026-07-17

Report date: 2026-07-17
Affected ramp: `eb597373-ed70-4275-a63d-aac172bdfe7a`
Affected flow: BRL onramp, Base-to-destination EVM route
Primary phases: `squidRouterPay`, `finalSettlementSubsidy`, `destinationTransfer`
Status: root cause identified; targeted lock-refresh and `squidRouterPay` polling mitigations implemented after this report

## Executive summary

The ramp was processed by multiple overlapping phase executions. The first
`squidRouterPay` execution exceeded the phase processor's 10-minute timeout, but its
internal polling continued. A retry started 30 seconds later and also timed out while
continuing internally. The ramp's database lock was not renewed during this work, so the
recovery worker later treated the active lock as expired and started another execution.

When the bridge eventually settled, several stale `squidRouterPay` executions completed
at approximately the same time. They independently advanced into
`finalSettlementSubsidy`, where at least two native-to-USDT funding swaps were submitted.
One execution then completed `destinationTransfer` and marked the ramp `complete`.
Another stale execution subsequently persisted an older phase transition and moved the
database state back to `destinationTransfer`.

The successful destination transfer had already removed the expected token balance from
the ephemeral account. The regressed `destinationTransfer` execution therefore waited
for a balance that could no longer arrive. It exhausted its initial attempt plus eight
retries, remained nonterminal, and was selected again by the recovery worker. This cycle
continued approximately every 45 minutes for the remainder of the supplied logs.

This was not a database deadlock. It was a phase-state regression followed by an
infinite recovery livelock.

## Impact

### Confirmed

- The intended destination transfer executed successfully once according to the API
  logs, and the ramp was temporarily marked `complete`.
- The persisted ramp phase was subsequently regressed to `destinationTransfer`.
- The recovery worker repeatedly executed an impossible balance precondition for more
  than six hours.
- The supplied error log contains two `squidRouterPay` timeouts and 81
  `destinationTransfer` balance timeouts through `2026-07-17T18:06:05.842Z`.
- At least two final-settlement native-to-USDT swap transactions were submitted:
  - `0xc9572cd1a67a2f50187ca527878319be66f11a8c441af5e853dabc5e3f6e8f2f`
  - `0x6bc4adb60cfc770fb66c7a4a98eafdae6734936d2b2246f732b1a65a221792f6`
- Recovery cycles consumed RPC, database, worker, and logging capacity without making
  progress.

### Requiring on-chain reconciliation

- Whether both final-settlement swap transactions succeeded and their exact output.
- Whether more than one final USDT subsidy transfer succeeded.
- The final token and native balances of the funding and ephemeral accounts.
- Whether the stored `destinationTransferTxHash` was never written, was overwritten by
  a stale JSON update, or remained present but was absent from the stale in-memory model.
- The exact net financial loss, if any, from duplicate swap fees, slippage, or duplicate
  subsidy transfers.

The existence of a single `Subsidy` bookkeeping row does not prove that only one
on-chain subsidy occurred. Bookkeeping is written after the side effect, uses a
find-then-create sequence, and is not protected by a unique `(ramp_id, phase)` database
constraint.

## Expected behavior

For a non-Base EVM destination, the relevant final phase sequence is:

```text
squidRouterSwap
  -> squidRouterPay
  -> finalSettlementSubsidy
  -> destinationTransfer
  -> complete
```

Only one processor should own the ramp. A timed-out execution should stop before a retry
starts. Once `complete` is persisted, no stale execution should be able to move the ramp
back to a nonterminal phase. Financial side effects should be recoverable without being
submitted twice.

## Relevant implementation

The report references the source tree as it existed during analysis:

- Processor and retry loop:
  `apps/api/src/api/services/phases/phase-processor.ts`
- Recovery worker:
  `apps/api/src/api/workers/ramp-recovery.worker.ts`
- Base handler and phase transition construction:
  `apps/api/src/api/services/phases/base-phase-handler.ts`
- Bridge settlement handler:
  `apps/api/src/api/services/phases/handlers/squid-router-pay-phase-handler.ts`
- Final settlement subsidy handler:
  `apps/api/src/api/services/phases/handlers/final-settlement-subsidy.ts`
- Destination transfer handler:
  `apps/api/src/api/services/phases/handlers/destination-transfer-handler.ts`
- Existing processor findings:
  `docs/security-spec/03-ramp-engine/state-machine.md`

The security specification already records two directly relevant known findings:

- F-003: database lock acquisition is not atomic.
- F-004: recoverable retry exhaustion leaves the ramp nonterminal, and a later
  processing cycle receives a fresh retry budget.

## Log evidence

### Normal progression into the affected phase

The ramp progressed normally through minting, swaps, fee distribution, and the Squid
source transaction. The relevant source and bridge transaction hashes were:

```text
Nabla approve:
0x4d94497f041714aeb6492d4255a26e923e617c37ec36267d2a03440a87bf76ff

Nabla swap:
0xc7ca43f2a80471d8cb53f6b70398df4686d9bf920f4ddeaf23f0a570adad6073

Fee distribution:
0x947144197d12e4e64857686888112dd1752d68ce19ce1b5f4a04d0d2deb34b50

Squid approve:
0x77edcb9fc091ff2d9e2797957c240e32ad60fbd2131ec31bbc513f0fc567f113

Squid swap / bridge source transaction:
0x141a0356e0db9ca7cf087918ffff9841f17fcb12a9175e70cc27b64fa9fd520f
```

The bridge was detected and additional Axelar gas was funded:

```text
info [...] SquidRouterPayPhaseHandler: Bridge transaction detected on Axelar. Proceeding to fund gas.
info [...] SquidRouterPayPhaseHandler: Base fund transaction sent with hash: 0x404eea351f96c4243286181ea66c3f30fc0c089fe13980dfc23e745fa45e1294
info [...] Subsidy created successfully with id 51204980-0deb-4342-b9f4-7c1d5600ac00 for ramp eb597373-ed70-4275-a63d-aac172bdfe7a
```

### Two processor timeouts

The persisted failure log contains these two entries:

```json
{
  "error": "Phase execution timed out",
  "phase": "squidRouterPay",
  "timestamp": "2026-07-17T11:19:51.503Z",
  "recoverable": true,
  "isPhaseError": true
}
```

```json
{
  "error": "Phase execution timed out",
  "phase": "squidRouterPay",
  "timestamp": "2026-07-17T11:30:21.528Z",
  "recoverable": true,
  "isPhaseError": true
}
```

The interval is 10 minutes 30 seconds: the configured 10-minute execution timeout plus
the configured 30-second retry delay. The second entry proves that the retry remained in
the same phase for another complete timeout window.

The operational log then shows recovery taking over the still-active ramp:

```text
info Attempting recovery in phase squidRouterPay for ramp eb597373-ed70-4275-a63d-aac172bdfe7a
info [...] Lock for ramp eb597373-ed70-4275-a63d-aac172bdfe7a has expired. Ignoring previous lock and continue processing...
info [...] Processing phase squidRouterPay for ramp eb597373-ed70-4275-a63d-aac172bdfe7a
```

### Concurrent late completions

At bridge settlement, the logs contain repeated success messages from executions that
had started at different times:

```text
info [...] Phase squidRouterPay executed successfully for ramp eb597373-ed70-4275-a63d-aac172bdfe7a
info [...] Phase changed from squidRouterPay to finalSettlementSubsidy for ramp eb597373-ed70-4275-a63d-aac172bdfe7a
info [...] Processing phase finalSettlementSubsidy for ramp eb597373-ed70-4275-a63d-aac172bdfe7a

info [...] Phase squidRouterPay executed successfully for ramp eb597373-ed70-4275-a63d-aac172bdfe7a
info [...] Phase changed from squidRouterPay to finalSettlementSubsidy for ramp eb597373-ed70-4275-a63d-aac172bdfe7a
info [...] Processing phase finalSettlementSubsidy for ramp eb597373-ed70-4275-a63d-aac172bdfe7a

info [...] SquidRouterPayPhaseHandler: Transaction 0x141a0356e0db9ca7cf087918ffff9841f17fcb12a9175e70cc27b64fa9fd520f successfully executed on Axelar.
info [...] Phase squidRouterPay executed successfully for ramp eb597373-ed70-4275-a63d-aac172bdfe7a
```

Within a single `squidRouterPay` invocation, `Promise.any()` also leaves its losing
promise running. If the destination balance check wins first, the bridge-status polling
promise can continue and emit another late Axelar success message. This adds noise, but
it does not by itself explain duplicate phase transitions. The duplicate transitions
require multiple handler executions.

### Duplicate final-settlement activity

The overlapping executions both observed an 84,160-raw-unit USDT settlement shortfall
and an underfunded funding account:

```text
info [...] FinalSettlementSubsidyHandler: Subsidizing 84160 raw units of USDT to 0xA778a815623892f25235932116637cA0F3BBc0b9
info [...] FinalSettlementSubsidyHandler: Funding account has insufficient balance. Swapping native token to USDT
info [...] FinalSettlementSubsidyHandler: Swapping 1093793475827218534 native units (approx. rate 8.463755e-14) to get required subsidy.
info [...] FinalSettlementSubsidyHandler: Swap transaction sent: 0xc9572cd1a67a2f50187ca527878319be66f11a8c441af5e853dabc5e3f6e8f2f. Waiting for receipt...

info [...] FinalSettlementSubsidyHandler: Subsidizing 84160 raw units of USDT to 0xA778a815623892f25235932116637cA0F3BBc0b9
info [...] FinalSettlementSubsidyHandler: Funding account has insufficient balance. Swapping native token to USDT
info [...] FinalSettlementSubsidyHandler: Swapping 1093793475827218534 native units (approx. rate 8.463755e-14) to get required subsidy.
info [...] FinalSettlementSubsidyHandler: Swap transaction sent: 0x6bc4adb60cfc770fb66c7a4a98eafdae6734936d2b2246f732b1a65a221792f6. Waiting for receipt...
```

The handler does not persist the funding-swap hash before waiting for its receipt. Its
idempotency check only covers `finalSettlementSubsidyTxHash`, which is the later subsidy
transfer. It therefore cannot recognize or reconcile a previously submitted funding
swap.

The log also records a later subsidy-transfer problem:

```text
error [...] FinalSettlementSubsidyHandler: Transaction 0xac2c732bd0d3af0ea49a6f91c509ea1c6d21f2929839a7d31de5835d725704bd failed or was not found. Retrying...
```

This hash must be reconciled on-chain before calculating the incident's financial
impact.

### Completion followed by state regression

One execution completed the transfer and the ramp:

```text
info [...] Phase destinationTransfer executed successfully for ramp eb597373-ed70-4275-a63d-aac172bdfe7a
info [...] Ramp eb597373-ed70-4275-a63d-aac172bdfe7a completed successfully
info Successfully processed ramp state eb597373-ed70-4275-a63d-aac172bdfe7a
```

After that completion, another execution continued and wrote the previous transition
again:

```text
info [...] Subsidy entry already exists for ramp eb597373-ed70-4275-a63d-aac172bdfe7a in phase finalSettlementSubsidy
info [...] Phase finalSettlementSubsidy executed successfully for ramp eb597373-ed70-4275-a63d-aac172bdfe7a
info [...] Phase changed from finalSettlementSubsidy to destinationTransfer for ramp eb597373-ed70-4275-a63d-aac172bdfe7a
info [...] Processing phase destinationTransfer for ramp eb597373-ed70-4275-a63d-aac172bdfe7a
```

This ordering is direct evidence that a stale execution survived beyond terminal
completion and was allowed to persist a nonterminal phase afterward.

### Repeated destination balance failures

Each destination failure has the same shape:

```json
{
  "error": "DestinationTransferHandler: Error during phase execution - Balance did not meet the limit within 180000ms",
  "phase": "destinationTransfer",
  "details": "RecoverablePhaseError: DestinationTransferHandler: Error during phase execution - Balance did not meet the limit within 180000ms",
  "recoverable": true,
  "isPhaseError": true
}
```

The first failure was recorded at `11:40:54.397Z`. Since the balance timeout is exactly
180 seconds, that execution began waiting at approximately `11:37:54Z`, matching the
completion and regression window in the operational logs.

The supplied failure log contains the following complete timestamp series. Each row is
one processing cycle containing the initial attempt plus eight retries:

| Cycle | Destination-transfer failure timestamps (UTC) |
|---|---|
| Initial regressed execution | `11:40:54.397`, `11:44:24.951`, `11:47:55.432`, `11:51:25.951`, `11:54:56.506`, `11:58:26.945`, `12:01:57.485`, `12:05:27.960`, `12:08:58.610` |
| Recovery 1 | `12:23:00.780`, `12:26:31.446`, `12:30:02.109`, `12:33:32.877`, `12:37:03.464`, `12:40:34.033`, `12:44:04.816`, `12:47:35.443`, `12:51:06.032` |
| Recovery 2 | `13:08:00.844`, `13:11:31.435`, `13:15:01.970`, `13:18:33.224`, `13:22:03.809`, `13:25:34.417`, `13:29:04.917`, `13:32:35.531`, `13:36:06.192` |
| Recovery 3 | `13:53:00.720`, `13:56:31.250`, `14:00:01.764`, `14:03:32.689`, `14:07:03.395`, `14:10:34.101`, `14:14:04.725`, `14:17:35.317`, `14:21:05.916` |
| Recovery 4 | `14:38:00.728`, `14:41:31.433`, `14:45:02.381`, `14:48:33.360`, `14:52:03.910`, `14:55:34.468`, `14:59:05.088`, `15:02:35.655`, `15:06:06.184` |
| Recovery 5 | `15:23:00.711`, `15:26:31.414`, `15:30:01.887`, `15:33:32.441`, `15:37:03.126`, `15:40:33.636`, `15:44:04.177`, `15:47:34.683`, `15:51:05.468` |
| Recovery 6 | `16:08:00.987`, `16:11:31.619`, `16:15:02.368`, `16:18:32.970`, `16:22:03.539`, `16:25:34.226`, `16:29:04.739`, `16:32:35.844`, `16:36:06.547` |
| Recovery 7 | `16:53:00.716`, `16:56:31.304`, `17:00:01.887`, `17:03:32.583`, `17:07:03.111`, `17:10:33.684`, `17:14:04.332`, `17:17:34.832`, `17:21:05.366` |
| Recovery 8 | `17:38:00.588`, `17:41:31.184`, `17:45:01.717`, `17:48:32.232`, `17:52:03.241`, `17:55:34.029`, `17:59:04.731`, `18:02:35.297`, `18:06:05.842` |

All timestamps are on 2026-07-17. There are 81 destination failures: nine attempts per
cycle across nine cycles.

Within a cycle, failures are approximately 210 seconds apart:

```text
180 seconds balance polling
+ 30 seconds retry delay
= 210 seconds per failed attempt
```

After the initial cycle, the first failures of later cycles settle into an approximately
45-minute cadence:

```text
~31 minutes for nine attempts and eight retry delays
+ 10-minute stale-state threshold
+ up to 5 minutes for the recovery cron boundary
= approximately 45 minutes between recovery cycles
```

This cadence directly demonstrates that the retry budget is bounded only within one
in-memory `processRamp()` call. It is not bounded across recovery cycles.

## Reconstructed timeline

| Time (UTC) | Event | Confidence |
|---|---|---|
| ~11:09:51 | `squidRouterPay` execution A begins. | High, derived from the 11:19:51 timeout. |
| 11:10-11:11 | Axelar bridge is detected; Base gas funding transaction is sent and recorded. | Confirmed by operational logs. |
| 11:19:51 | Execution A reaches the processor's 10-minute timeout. Retry 1 is scheduled. | Confirmed by failure log. |
| ~11:20:21 | `squidRouterPay` execution B begins after the 30-second delay. | High, derived from timeout cadence. |
| ~11:29-11:30 | Recovery sees the unrenewed lock as expired and starts another execution. | Confirmed by operational logs; exact second unavailable. |
| 11:30:21 | Execution B reaches its 10-minute processor timeout. | Confirmed by failure log. |
| ~11:37 | Bridge settlement becomes visible. Multiple abandoned/live checks complete close together. | Confirmed by repeated success logs. |
| ~11:37 | Multiple `finalSettlementSubsidy` executions observe the same shortfall and submit at least two funding swaps. | Confirmed by distinct transaction hashes. |
| ~11:37 | One execution completes `destinationTransfer` and writes `complete`. | Confirmed by operational logs. |
| ~11:37 | A stale execution writes `finalSettlementSubsidy -> destinationTransfer` after completion. | Confirmed by log ordering. |
| ~11:37:54 | Regressed `destinationTransfer` starts waiting for the already-spent ephemeral balance. | High, derived from first 180-second timeout. |
| 11:40:54 | First regressed destination attempt times out. | Confirmed by failure log. |
| 12:08:58 | Initial nine-attempt destination budget is exhausted. Ramp remains nonterminal. | Confirmed by cadence and processor configuration. |
| 12:23:00 onward | Recovery repeatedly grants fresh nine-attempt budgets. | Confirmed by complete timestamp series. |
| 18:06:05 | Last supplied failure entry; the loop was still active. | Confirmed by failure log. |

## Root-cause analysis

### 1. Processor timeout did not cancel these production handlers

`PhaseProcessor` races `handler.execute()` against a timeout and sends an
`AbortSignal` when the timeout wins. Shared EVM balance helpers support cancellation,
but cancellation works only if each handler accepts the signal and forwards it.

The affected handlers do not propagate it:

- `SquidRouterPayPhaseHandler.executePhase()` does not accept or forward the signal.
- Its destination balance check calls `checkEvmBalanceForToken()` without `signal`.
- Its initial delay, bridge-status loop, and polling delays are not abortable.
- `FinalSettlementSubsidyHandler.executePhase()` does not forward the signal to any of
  its balance waits.
- `DestinationTransferHandler.executePhase()` does not forward the signal to its
  balance wait.

The existing cancellation regression test uses a synthetic handler that explicitly
passes its signal into `waitUntilTrue()`. It proves the processor emits a signal, but it
does not prove that real registered handlers stop after timeout.

Result: the 10-minute timeout scheduled a retry while the timed-out execution remained
alive and capable of late phase transitions and financial side effects.

### 2. The fixed lock lease expired during active work

The processor writes `processingLock.lockedAt` once when processing starts. The lock is
considered expired after 15 minutes, but there is no heartbeat or renewal while:

- a handler polls;
- the processor waits 30 seconds before a retry;
- recursive processing advances through multiple phases; or
- an external network operation takes longer than expected.

The first `squidRouterPay` timeout occurred after 10 minutes. Its retry then consumed
another 10-minute window while retaining the original lock timestamp. The lock therefore
became eligible for takeover five minutes into the retry even though processing was
active.

Result: the recovery worker legitimately followed the current lock rules but incorrectly
classified a live processor as crashed.

### 3. Lock acquisition and release were not ownership-safe

The database lock is a JSON flag checked on a previously loaded model instance and then
set using a separate unconditional update. This is not an atomic compare-and-swap.
Multiple API instances can observe an unlocked row and both set it to locked.

The lock has no owner or fencing token. Release is also unconditional, so an old
execution can clear a lock acquired by a newer execution.

The in-memory `lockedRamps` set protects only one Node.js process and cannot coordinate
multiple instances or an execution that has been removed from the set after its
processor timeout.

Result: the lock cannot establish durable single ownership.

### 4. Phase persistence allowed stale and terminal-state regression

After a handler returns, the processor unconditionally updates `currentPhase` and
`phaseHistory`. The update does not require that:

- the database remains in the handler's source phase;
- the ramp remains nonterminal;
- the caller still owns the lock; or
- the caller's lease generation is current.

An execution that started in `finalSettlementSubsidy` can therefore return later and
write `destinationTransfer` even after another execution has written `complete`.

Result: terminal state was not monotonic. `complete` was regressed to a nonterminal
phase.

### 5. Whole-JSON metadata writes allowed lost updates

Affected handlers write metadata using a stale in-memory spread:

```ts
state: {
  ...state.state,
  someTransactionHash: txHash
}
```

Two concurrent model instances can each contain a different old snapshot. The later
write replaces the entire JSONB value and can remove hashes written by the earlier
execution. In this incident, a stale final-subsidy write could remove
`destinationTransferTxHash` after the successful destination broadcast.

Even if the database retained the hash, the stale `RampState` passed recursively into
the regressed destination handler might not contain it. Either condition bypasses the
handler's receipt-based completion check.

Result: recovery could fail to recognize an already-completed destination transaction.

### 6. Final-settlement financial operations were not durably idempotent

The final-settlement handler performs two potentially separate financial operations:

1. Swap funding-account native token into the required output token when necessary.
2. Transfer the output token subsidy to the ephemeral account.

The funding-swap hash is held only in a local variable while waiting for the receipt. It
is not persisted as an operation intent or recoverable transaction. Two concurrent
executions can both observe the same funding-account shortfall and submit independent
swaps before either balance update is visible.

The later subsidy-transfer hash is persisted only after receipt confirmation and after
bookkeeping. A process crash or lost lease between broadcast and persistence leaves the
next execution unable to distinguish "not sent" from "sent but not recorded."

Result: overlapping execution produced at least two funding swaps and exposed the
subsidy transfer to duplicate-submission risk.

### 7. Retry exhaustion was not durable

The retry counter is an in-memory `Map`. After the initial attempt plus eight retries,
the processor logs exhaustion, deletes the counter, and returns without moving the ramp
to a terminal or operator-intervention state.

`processRamp()` catches or absorbs phase failures, so the recovery worker can log
`Successfully processed ramp state` even when the ramp remains stuck in the same phase.
Once `updatedAt` becomes older than ten minutes, recovery invokes `processRamp()` again
and receives a fresh retry budget.

Result: the failed phase entered a predictable infinite soft loop.

## Contributing factors

- `squidRouterPay` intentionally allows a 15-minute destination balance wait, longer
  than the processor's 10-minute handler timeout.
- The lock expiry is measured from the start of the entire processing call, not from
  recent processor activity.
- `Promise.any()` does not cancel the losing bridge or balance check.
- Recovery cron executions are not explicitly configured with a durable per-ramp
  backoff or manual-review cutoff.
- Logging does not include a processor execution ID, lock owner, lease generation, or
  attempt-cycle ID, making overlapping workers difficult to distinguish.
- `Successfully processed ramp state` describes function return, not successful phase
  advancement or terminal completion.
- The destination handler requires the full expected balance before checking/broadcasting
  unless a usable stored hash is present. Once a successful transfer empties the account
  and its hash is missing, the precondition can never recover naturally.

## Why the destination phase could never recover

The successful execution transferred the expected destination tokens from the ephemeral
account to the user. The stale execution then re-entered `destinationTransfer` with no
usable successful transaction hash and called the balance precondition first.

Its required condition was effectively:

```text
ephemeral destination-token balance >= full quoted output amount
```

After a successful destination transfer, the expected steady state is the opposite:

```text
ephemeral destination-token balance ~= 0
user destination-token balance increased
```

No amount of retrying can make the original precondition true unless the ephemeral is
funded again. Automatically funding it again would be unsafe because the user may
already have received the intended payment.

## Immediate operational response

Before manually changing this ramp or replaying any transaction:

1. Stop automated recovery for this ramp, or place it in an operator-review state that
   the recovery query excludes.
2. Derive the deterministic hash of the presigned destination transaction and check its
   receipt on the destination chain.
3. Confirm the user destination balance and transfer event.
4. Inspect both final-settlement swap hashes and the subsidy-transfer hash
   `0xac2c...704bd`.
5. Reconcile the funding account, ephemeral account, and `subsidies` records.
6. If the destination transaction succeeded, restore the ramp to `complete` without
   rebroadcasting or re-funding.
7. Record any duplicate swap fees, slippage, or subsidy transfer as incident loss.

Do not solve this instance by topping up the ephemeral account until the existing signed
destination transaction and recipient balance have been reconciled. A top-up could make
the stale handler pay the user a second time.

## Recommended improvements

### Priority 0: prevent stale phase writes

Make every phase transition a conditional database update. At minimum, it must require
the expected source phase and reject terminal-state regression:

```sql
UPDATE ramp_states
SET current_phase = :next_phase,
    phase_history = :next_history
WHERE id = :ramp_id
  AND current_phase = :expected_phase
  AND current_phase NOT IN ('complete', 'failed');
```

With lease ownership, it must additionally require the caller's fencing token. Exactly
one row must be affected. If zero rows are affected, the execution is stale and must stop
without invoking another handler.

This is the strongest immediate containment because it protects terminal state even if
cancellation or locking fails elsewhere.

### Priority 0: implement fenced leases

Replace the Boolean JSON lock with ownership-aware lease fields, for example:

```text
processing_owner_id
processing_generation
processing_lease_expires_at
```

Required properties:

- Acquisition is one atomic conditional update.
- Every acquisition receives a new, monotonically increasing generation or unique
  fencing token.
- Active processors renew the lease before expiry.
- Phase and metadata writes require the current owner/generation.
- Release updates only the row owned by that execution.
- An old execution cannot release or write through a newer owner's lease.

A long-running database transaction or row lock should not be held across external API
and chain waits. A short atomic lease with heartbeat and fencing is better suited to this
workflow.

### Priority 0: complete cancellation propagation

Every long-running production handler must accept the processor's `AbortSignal` and pass
it through all waits:

- `checkEvmBalanceForToken({ signal })`
- bridge status polling
- initial and retry delays
- receipt waits where the client supports cancellation or bounded polling
- other shared `waitUntilTrue*` helpers

For `squidRouterPay`, create a child abort controller for the balance and bridge checks.
When either branch establishes settlement, abort the other branch before returning.

Cancellation is cooperative and should not be the only correctness boundary. Fenced
database writes are still required because an RPC call or external library may not stop
immediately.

### Priority 1: align timeout and lease semantics

- A phase's internal maximum wait must not exceed the processor timeout unless the
  processor timeout is renewed or disabled for that handler.
- Lock lease expiry must be based on missed heartbeats, not total ramp duration.
- Emit explicit metrics when a handler timeout, lease expiry, or takeover occurs.
- A takeover should include the previous owner and generation in logs.

### Priority 1: make transaction side effects durably idempotent

For each backend-funded transaction:

1. Persist an operation record or reserved nonce before broadcast.
2. Broadcast the transaction.
3. Persist the transaction hash immediately after the node accepts it, before waiting
   for a receipt.
4. On recovery, reconcile the existing hash/nonce before submitting another transaction.
5. Mark success only after receipt verification.

Apply this to both the final-settlement funding swap and subsidy transfer. A single
`finalSettlementSubsidyTxHash` is insufficient to represent both operations.

Where the transaction is presigned, derive its deterministic transaction hash directly
from the serialized signed transaction. The destination handler can check that receipt
without relying exclusively on mutable state metadata.

### Priority 1: prevent lost JSON metadata updates

Do not replace the whole `state` JSONB document from stale model snapshots. Use one of:

- conditional `jsonb_set` updates for individual fields;
- a normalized transaction-operation table;
- row-version optimistic concurrency; or
- reload, merge, and compare-and-swap under the current lease token.

Transaction hashes should be monotonic: once a valid hash is written, unrelated updates
must not remove it.

### Priority 1: persist retry state and recovery eligibility

Move retry policy out of the process-local `Map`. Persist at least:

```text
phase_attempt_count
next_retry_at
last_phase_error_at
recovery_status
```

After the durable maximum is reached, transition to an explicit state such as
`manualReview` or mark the ramp as recovery-ineligible. Do not automatically grant a new
budget merely because another cron cycle begins.

The recovery worker should report outcomes accurately:

- `completed`
- `advanced`
- `retry_scheduled`
- `manual_review_required`
- `skipped_lock_held`
- `failed`

It should not log `Successfully processed` when the phase remained unchanged after
retry exhaustion.

### Priority 2: strengthen subsidy bookkeeping

- Add a database uniqueness constraint appropriate to the intended accounting model,
  likely `(ramp_id, phase, operation_type)` rather than only `(ramp_id, phase)` if a phase
  can legitimately contain multiple operations.
- Replace `findOne()` followed by `create()` with an atomic insert/upsert.
- Treat bookkeeping as evidence of a reconciled transaction, not as the idempotency
  mechanism for the transaction itself.

### Priority 2: improve observability

Add structured fields to all processor and handler logs:

```text
rampId
phase
processorExecutionId
attempt
retryCycle
lockOwner
lockGeneration
expectedPhase
persistedPhase
transactionHash
operationType
```

Add alerts for:

- a transition from `complete` or `failed` to a nonterminal phase;
- more than one active execution ID for the same ramp;
- lease takeover while the previous owner is still producing logs;
- more than one funding transaction for the same ramp/phase/operation;
- repeated retry-budget exhaustion;
- a ramp receiving more than a configured number of errors per hour.

## Verification plan

The fixes should include regression tests that reproduce the incident rather than only
testing isolated helpers.

### Processor concurrency tests

- Start two processors against the same database row and assert only one atomic lease
  acquisition succeeds.
- Let owner A's lease expire, let owner B acquire a new generation, then assert A cannot
  transition a phase, update metadata, or release B's lease.
- Complete a ramp in owner B and assert a late return from owner A cannot regress
  `complete`.
- Run the same test using separate `PhaseProcessor` instances to model separate API
  processes; an in-memory set is insufficient for this test.

### Cancellation tests

- Execute the real `SquidRouterPayPhaseHandler` with controlled bridge and balance
  adapters, trigger processor timeout, and assert all polling stops.
- Assert the losing branch of the settlement race is cancelled after the other succeeds.
- Repeat for real final-settlement and destination balance polling.

### Financial idempotency tests

- Crash or abort after funding-swap broadcast but before receipt persistence; recovery
  must reconcile rather than broadcast a second swap.
- Crash after subsidy-transfer broadcast but before phase advancement; recovery must
  recognize the existing transaction.
- Run two concurrent final-settlement handlers and assert only one operation intent and
  one on-chain submission are produced.

### Recovery tests

- Exhaust the durable retry budget and assert subsequent recovery cron runs do not reset
  it.
- Assert the worker does not report success when no phase progress occurred.
- Given a completed deterministic presigned destination transaction but missing metadata,
  assert recovery derives its hash, finds the receipt, and restores `complete` without
  requiring the spent ephemeral balance to return.

## Conclusion

The incident required several protections to fail together:

1. `squidRouterPay` exceeded the processor timeout.
2. Timeout cancellation was not propagated into the real polling handler.
3. The unrenewed 15-minute lock expired while legitimate retry work was active.
4. Recovery started another execution without ownership fencing.
5. Multiple stale executions advanced concurrently when bridge settlement arrived.
6. Final-settlement operations were not durably idempotent and at least two funding
   swaps were submitted.
7. A stale phase transition was allowed to overwrite terminal `complete`.
8. The destination transaction could not be recognized reliably after its funds had
   left the ephemeral account.
9. Process-local retry exhaustion was reset by each recovery cycle.

The immediate symptom was an endless `destinationTransfer` balance timeout, but changing
that timeout or increasing retries would not address the failure. The primary correctness
boundary must be an atomic, ownership-fenced phase transition that makes terminal states
monotonic. Cooperative cancellation, lease renewal, durable transaction idempotency,
metadata-safe updates, and persistent retry state are the supporting controls required
to prevent recurrence and limit impact when an external bridge is slow.

## Implemented targeted mitigation

The initial low-impact production mitigation implements the timing controls identified
in this report without replacing the existing lock model:

- `PhaseProcessor` refreshes `processingLock.lockedAt` before every phase attempt,
  including retries and recursive phase advancement.
- The existing processor timeout remains the outer 10-minute safety boundary and is now
  read through shared phase-processor timeout configuration.
- `squidRouterPay` bounds both its destination-balance check and bridge-status loop at
  80% of the processor timeout.
- If neither polling branch detects settlement, both reject and `checkStatus` raises a
  recoverable phase error before the processor's outer timeout.

Under normally bounded external requests, these changes prevent the incident's
lock-expiry-during-retry path and bound unsuccessful `squidRouterPay` polling before the
processor timeout.

### Timing measurements and resulting envelope

| Measurement | Incident / default value | Source |
|---|---:|---|
| Processor phase timeout | 10 minutes (`600,000ms`) | `PHASE_PROCESSOR_MAX_EXECUTION_TIME_MS` default |
| SquidRouter polling timeout after mitigation | 8 minutes (`480,000ms`) | 80% of the processor timeout |
| Database lock expiry | 15 minutes | `PhaseProcessor.isLockExpired()` |
| Default retry delay | 30 seconds | `PHASE_PROCESSOR_RETRY_DELAY_MS` default |
| Incident interval between SquidRouter timeouts | 10 minutes 30 seconds | `11:19:51.503Z` to `11:30:21.528Z` |
| Destination retry-attempt interval | approximately 3 minutes 30 seconds | 180-second balance timeout plus 30-second retry delay |
| Repeated recovery-cycle interval | approximately 45 minutes | Supplied failure-log timestamp series |

The eight-minute value is derived from the same configuration read as the processor
timeout, so test or deployment overrides preserve the 80% relationship. The focused
configuration regression test verifies that a `1,000ms` processor timeout produces an
`800ms` SquidRouter timeout.

The bridge timer starts before the existing 60-second initial delay. Timeout detection
occurs at a bridge-loop boundary, so the practical bridge rejection can be later than
exactly eight minutes by up to the 10-second polling interval plus the duration of an
in-flight SquidRouter or Axelar status request. The approximately two-minute margin to
the processor timeout is intended to absorb that normal overrun.

The destination-balance branch uses the same eight-minute timeout. `Promise.any()` only
rejects after both bridge and balance checks reject, at which point `checkStatus` raises
a `RecoverablePhaseError`. Under normally bounded external requests, the handler exits
before the processor's 10-minute outer timeout and the processor starts its retry after
30 seconds.

At the start of that retry, `processPhase()` refreshes `lockedAt`. The expected lock-age
sequence is therefore:

```text
00:00  lock refreshed; SquidRouter attempt starts
~08:00 both settlement checks time out recoverably
~08:30 lock refreshed; retry starts
```

This remains well below the 15-minute lock expiry and prevents the recovery worker from
creating the second tracked processor through the exact timing path observed in this
incident.

### Expectations of this mitigation

- A normally responsive but unsettled SquidRouter/Axelar operation exits recoverably at
  approximately eight minutes instead of reaching the processor's 10-minute timeout.
- Every phase attempt and retry refreshes the lock before handler execution.
- A tracked retry should not be mistaken for abandoned work merely because the original
  lock timestamp is older than 15 minutes.
- The incident path where recovery took over during the original processor's retry
  should no longer produce two tracked `processRamp()` chains.
- The outer processor timeout remains unchanged as a fallback for unexpectedly blocked
  code outside the normal polling cadence.

### Limitations and residual risks

- This implementation deliberately does not use `AbortSignal` in
  `SquidRouterPayPhaseHandler`. A hung external status request cannot be interrupted by
  the elapsed-time check. If it remains blocked through the outer 10-minute timeout, the
  processor can still abandon that handler invocation.
- `Promise.any()` does not cancel its losing branch. If balance settlement succeeds
  before bridge-status polling finishes, the bridge branch can continue until it
  succeeds, fails, or reaches its eight-minute deadline. The mitigation bounds that
  branch but does not stop it immediately.
- Because the bridge branch contains Axelar gas funding, a losing branch can still make
  that side effect before its deadline. Existing transaction-hash checks reduce repeat
  funding, but this change is not a general financial-idempotency guarantee.
- Timeout checks run between polling iterations. They do not interrupt an in-flight RPC,
  HTTP request, transaction submission, or receipt wait.
- Database lock acquisition remains non-atomic (F-003). Two API instances that begin
  from an unlocked row at the same time can still create two tracked processors.
- The lock has no owner token. Refresh and release do not prove that the caller owns the
  current lock.
- Phase transitions are still not compare-and-swap updates. If concurrent tracked
  processors arise through another path, a stale transition can still overwrite a newer
  phase, including a terminal phase.
- Recoverable retry counts remain process-local (F-004). Recovery can grant a new retry
  budget after one processing cycle exhausts its retries.
- Whole-JSON metadata writes and final-settlement transaction idempotency are unchanged.

Ownership-fenced locking, conditional phase persistence, durable retry state, and
transaction-operation reconciliation therefore remain recommended follow-up work. This
mitigation is intentionally scoped to the observed lock-expiry-during-retry path and to
ensuring normal SquidRouter polling rejects before the outer processor timeout.
