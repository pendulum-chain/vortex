# State Machine — Phase Processor

## What This Does

The phase processor is the core orchestration engine for ramp operations. It executes ramps as a series of discrete phases, each handled by a dedicated handler. The `PhaseProcessor` is a singleton that:

1. Acquires a lock on a ramp (in-memory `Set` + database `processingLock` field)
2. Looks up the current phase's handler from the `phaseRegistry`
3. Executes the handler with a 10-minute timeout
4. Persists the phase transition (only `currentPhase` and `phaseHistory` fields)
5. Recursively processes the next phase until reaching a terminal state (`complete` or `failed`)
6. Retries recoverable errors up to 8 times with configurable delay (default 30 seconds)
7. Transitions to `failed` on unrecoverable errors

There are 28+ phase handlers covering the full ramp lifecycle across all integration paths.

### Locking Mechanism

The processor uses a dual-lock approach:
- **In-memory lock**: `lockedRamps` Set — prevents the same Node.js process from double-processing
- **Database lock**: `processingLock` JSON field on `RampState` — persists lock state across restarts and (in theory) across multiple API instances

Lock expiry is set to 15 minutes. If a lock is older than 15 minutes, it's considered stale and can be force-released.

## Security Invariants

1. **Phase transitions MUST be validated** — A phase handler returns the next phase. The processor persists it. The handler itself is responsible for returning a valid next phase. Invalid transitions should be caught by the phase registry or handler logic.
2. **Only `currentPhase` and `phaseHistory` MUST be updated during phase transitions** — The processor uses `{ fields: ["currentPhase", "phaseHistory"] }` to prevent handlers from accidentally overwriting unrelated state columns.
3. **Terminal states (`complete`, `failed`) MUST halt processing** — Once a ramp reaches a terminal state, the processor MUST stop recursion and clean up retry counters.
4. **Lock acquisition MUST be atomic** — **KNOWN ISSUE**: The current implementation reads `state.processingLock.locked` from a potentially stale DB read, then sets it in a separate UPDATE. Between the read and write, another process could also acquire the lock. There is no `SELECT FOR UPDATE`, advisory lock, or atomic compare-and-swap.
5. **Lock expiry MUST prevent indefinite stalls** — If a process crashes while holding a lock, the 15-minute expiry ensures another process can eventually take over. The `isLockExpired()` check validates the timestamp. **FIXED (2026-07-05)**: the takeover previously never succeeded — after force-releasing the expired DB lock, `acquireLock` re-read the stale in-memory `state.processingLock.locked` and gave up. `processRamp` now reloads the state after the release. Regression-tested in `apps/api/src/tests/corridors/brl-onramp.scenario.test.ts` ("lock takeover"), alongside a companion test that a *fresh* foreign lock is neither processed past nor clobbered.
6. **Retries MUST be bounded** — Maximum 8 retries (`MAX_RETRIES`). After exhaustion, the processor stops retrying (but does not automatically transition to `failed` — this is a gap).
7. **Phase execution MUST be time-bounded** — The 10-minute timeout (`MAX_EXECUTION_TIME_MS`) prevents handlers from hanging indefinitely. Timeouts are treated as recoverable errors.
8. **The retry counter MUST be reset on successful phase advancement** — When the phase changes, `retriesMap.delete(state.id)` clears the counter, giving the next phase a fresh retry budget.
9. **Error logs MUST be appended, never overwritten** — Each error is pushed to the `errorLogs` array with timestamp, phase, recoverability flag, and stack trace.
10. **Phase handlers MUST NOT directly mutate the database** — Only the processor should call `state.update()` for phase transitions. Handlers return a pending state object.

## Threat Vectors & Mitigations

| Threat | Attack Scenario | Mitigation |
|---|---|---|
| **Race condition on locking** | Two API instances process the same ramp simultaneously due to non-atomic lock acquisition | **KNOWN VULNERABILITY**: No database-level atomic lock. Mitigation: in-memory lock helps for single-instance deployments; multi-instance requires `SELECT FOR UPDATE` or advisory locks |
| **Stale state execution** | Handler reads stale data from DB cache, executes with wrong balances/amounts | Phase processor calls `findByPk` before each ramp processing; handlers should re-read state from DB as needed |
| **Infinite retry loop** | A recoverable error keeps retrying forever | Bounded at 8 retries; after exhaustion, processing stops |
| **Phase handler timeout** | A handler hangs (e.g., waiting for an RPC response that never comes), blocking the ramp | 10-minute timeout per phase; timeout throws `RecoverablePhaseError` which triggers retry |
| **Lock starvation** | Process acquires lock, crashes, lock persists for 15 minutes | Lock expiry mechanism detects stale locks; force-releases and reacquires |
| **Retry counter memory leak** | `retriesMap` (in-memory `Map`) grows unbounded for many ramps | Counter is deleted on terminal state, successful phase change, or max retries reached. Long-running ramps with many retries could accumulate entries, but each entry is just an integer. |
| **Phase skip attack** | Attacker manipulates DB to skip phases (e.g., jump from `initial` to `complete`) | Phase transitions are controlled by handler return values, not external input. However, if an attacker has DB access, they could modify `currentPhase` directly — no DB-level constraints prevent invalid transitions. |
| **Unrecoverable error without state transition** | A non-PhaseError (unexpected exception) propagates up without transitioning to `failed` | The catch block re-throws non-PhaseErrors after logging. The outer `processRamp` catches this, but the ramp stays in its current phase. The lock is released in `finally`. On next processing cycle, the ramp will be retried. |

## Audit Checklist

- [EXISTING FINDING] **F-003**: Lock acquisition is non-atomic — `state.processingLock.locked` check and `RampState.update()` are separate operations with a race window. No `SELECT FOR UPDATE` or advisory lock. Multi-instance deployment would be vulnerable.
- [EXISTING FINDING] **F-004**: After max retries exhausted for a recoverable error, the ramp stays in its current phase (not transitioned to `failed`). Retry counter resets across processing cycles, creating an infinite soft loop.
- [x] `state.update()` in the processor uses `{ fields: ["currentPhase", "phaseHistory"] }` — enforced and not bypassed
- [x] Terminal states `complete` and `failed` both trigger `retriesMap.delete()` and halt recursion
- [x] `MAX_EXECUTION_TIME_MS` (10 minutes) is enforced via `Promise.race` with a timeout promise
- [x] `MAX_RETRIES` (8) is the hard limit — no code path bypasses this (caveat: resets across cycles per F-004)
- [x] `RecoverablePhaseError.minimumWaitSeconds` is respected when provided; fallback is 30 seconds
- [x] `phaseHistory` is append-only — phase transitions add to the array, never truncate it
- [x] Error logs include: error message, stack trace, phase name, recoverability flag, and ISO timestamp
- [x] No phase handler directly calls `RampState.update()` for `currentPhase` — only the processor does this
- [x] The `lockedRamps` Set is cleaned up in the `finally` block (`this.lockedRamps.delete(state.id)`)
- [x] Lock expiry handles edge cases: missing timestamp → expired, invalid date → expired, NaN → expired
- [x] Phase processor is a singleton — `PhaseProcessor.getInstance()` pattern, default export is singleton instance, no other file creates `new PhaseProcessor()`
- [EXISTING FINDING] **F-056**: `sandboxEnabled` causes `initial-phase-handler` to skip the entire state machine (transitions directly `initial` → `complete` after a 10-second sleep) — no production guard prevents this.
