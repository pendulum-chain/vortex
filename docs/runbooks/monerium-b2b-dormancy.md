# Runbook: Monerium B2B Onramp — Dormancy Gate

Why this exists: CEX destination-rotation risk concentrates in dormant accounts — an exchange
silently rotates a deposit address, months later a deposit arrives, and USDC is forwarded to an
address the client no longer controls. Undetectable on-chain. The dormancy gate converts that
silent loss into a pause (b2b-variant doc §6).

## Gate mechanics (automatic)

Implemented in `apps/api/src/api/services/monerium-b2b/dormancy.ts`, run every keeper cycle:

- An `active` account with **no confirmed conversion for 60 days** (placeholder — registry P5;
  anchor = last confirmed `MoneriumConversionExecution`, or account creation if none) is paused:
  the backend calls `setGuardianPaused(true)` on the clone with the guardian key and records
  `dormant_since` on the `MoneriumAccount` row.
- If `MONERIUM_B2B_GUARDIAN_PRIVATE_KEY` is unset, the gate runs **log-only**: `dormant_since`
  is recorded and a warning states that no on-chain pause exists.
- While `dormant_since` is set, the conversion executor skips the account entirely.

The pause is protective-only (contract invariant): it blocks `swapAndForward` and nothing else.
The client's fallback paths (`sweep`, `setDestination`, `setClientPaused`, …) and the
permissionless dead-man sweep (`sweepStrandedEure` after SWEEP_DELAY, registry P3) keep working.
EURe arriving during dormancy accumulates safely on the forwarder; if it strands past
SWEEP_DELAY it flows to the client's `fallbackAddress` automatically.

## Re-confirmation (manual, via partner)

Re-confirmation mechanics are a partner-agreement item (**registry B5**) — until settled, the
operational procedure is:

1. Ask the partner to re-confirm with the client that the `destination` address is still valid
   and under the client's control (a partner API ping/written confirmation suffices — zero
   client UI by design).
2. If the destination changed: the **client** updates it via their fallback key
   (`setDestination` from `fallbackAddress`) — Vortex cannot and must not do this. For CEX
   destinations, re-run the penny test (onboarding runbook §7; amount registry B2).
3. Archive the confirmation evidence with the account record.

## Un-pause

Only after re-confirmation:

```bash
cast send <forwarderAddress> "setGuardianPaused(bool)" false --rpc-url $RPC --private-key $GUARDIAN_KEY
```

Then clear the dormancy flag so the executor resumes:

```sql
UPDATE monerium_accounts SET dormant_since = NULL WHERE forwarder_address = '<forwarderAddress>';
```

The next keeper cycle converts any accumulated balance. Verify: a `SwapExecuted` for the
forwarder, the execution row `confirmed`, and no `stranded EURe` alert on the next monitoring
pass.

## Edge notes

- Un-pausing without clearing `dormant_since` leaves the executor skipping the account (the DB
  flag, not the chain flag, gates the executor) — always do both.
- A dormant account that re-confirms but stays unused simply re-enters the gate after another
  window; that is intended.
- Do not un-pause to "flush" a balance without re-confirmation — the balance is exactly the
  rotation-risk scenario the gate exists for.
