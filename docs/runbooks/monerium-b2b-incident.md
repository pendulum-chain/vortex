# Runbook: Monerium B2B Onramp — Incident Response

Scope: the B2B forwarder deployment (`contracts/monerium-forwarder/`) and its keeper/monitoring
backend (`apps/api/src/api/services/monerium-b2b/`). Spec: `docs/prd/monerium-b2b-implementation-plan.md`,
`docs/security-spec/05-integrations/monerium-b2b.md`.

Ground rules that shape every procedure here:

- **Vortex powers are delay-only.** Guardian/keeper can pause and execute the policy — never move
  or redirect funds. There is no Vortex-side rescue path by design.
- **Pauses never trap client funds.** `fallbackAddress` functions (`sweep`, `setDestination`,
  `setFallbackAddress`, `setClientPaused`) and the permissionless dead-man sweep
  (`sweepStrandedEure`, after SWEEP_DELAY) work while paused. Do not promise otherwise in comms.
- **Never send raw EURe to a CEX destination.** EURe recovery targets are `fallbackAddress` only.

## 1. Pause procedures

The guardian key is `MONERIUM_B2B_GUARDIAN_PRIVATE_KEY` (distinct from keeper and attestor keys).
`$RPC` = the chain RPC, `$FACTORY` = the factory address from the published manifest.

**Per-clone pause** (one client account — compliance hold, dormancy, targeted issue):

```bash
cast send <forwarderAddress> "setGuardianPaused(bool)" true --rpc-url $RPC --private-key $GUARDIAN_KEY
```

**Global pause** (all clones at once — protocol-level incident):

```bash
cast send $FACTORY "setGlobalPaused(bool)" true --rpc-url $RPC --private-key $GUARDIAN_KEY
```

Both block `swapAndForward` only. Unpause = same call with `false`. Cap reduction (availability
lever, instant, bounded by immutables):

```bash
cast send $FACTORY "setPerSwapCap(uint256)" <newCapRaw> --rpc-url $RPC --private-key $GUARDIAN_KEY
```

## 2. Monerium IBAN suspension ask

Per-IBAN suspension capability is **G1 item 7 — not yet contractual** (registry). Until the MSA
settles it, this is a best-effort ask:

1. Contact Monerium support/emergency channel; identify the whitelabel partner account and the
   affected IBAN(s) + linked forwarder address(es).
2. Ask for: suspension of inbound SEPA on the IBAN(s) (deposits bounce back to senders), NOT
   profile closure.
3. Record ticket/response — feed the outcome back into the G1 negotiation record.

While unsuspended, inbound SEPA keeps minting EURe to the forwarder. That is safe (funds sit
behind the contract's invariants) but grows exposure — factor it into comms urgency.

## 3. User notification

Clients have no Vortex UI; all comms run through the partner plus direct email.

1. Notify the partner ops contact first (they own the client relationship).
2. Email affected clients: **stop sending EUR to your IBAN until further notice**; deposits
   already sent will either convert normally after resolution or be recoverable via the
   fallback address — no funds are lost by pausing.
3. Status page entry if the pause is global.

## 4. Critical-vulnerability sequence (the 02:00-UTC runbook)

Adapted from PRD v2 §12 for the B2B topology (immutable clones, no per-user migration signature).
Assume a suspected vulnerability in `VortexForwarder`/factory:

1. **Pause all** — `setGlobalPaused(true)` (§1). Instant, protective-only, reversible.
2. **Ask Monerium to suspend affected IBANs** (§2) so no new EURe mints while assessing.
3. **Notify** partner + clients to stop sending EUR (§3).
4. **Assess.** Funds at risk are EURe balances on forwarders (check with the stranded-balance
   monitor output or `cast call <eure> "balanceOf(address)" <forwarder>`). Run the manifest
   verifier against the live deployment as part of the assessment:
   `bun script/verify-manifest.ts <manifest.json> $RPC` (from `contracts/monerium-forwarder/`).
5. **If funds must move: only clients can move them.** Instruct clients (via partner) to sweep
   EURe to safety with their fallback key: `sweep(EURE, <their address>)` from `fallbackAddress`.
   Provide exact calldata and a verification walkthrough. The issuer recovery backstop
   (Monerium burn + payout to the client's own bank account) is the last resort — best-effort
   until registry T1 is resolved.
6. **Ship the fix as a migration.** Immutable contracts: deploy fixed implementation + factory
   (new audit), deploy new clones per client, link the new clone to the client's profile
   (attestor flow, onboarding runbook §3), issue/move the IBAN, penny-test, regenerate + publish
   the manifest. Old clones stay paused; residual balances leave via fallback sweep or dead-man
   sweep (never lost — SWEEP_DELAY, registry P3).
7. **Unpause / decommission.** Unpause only contracts that are confirmed unaffected.

## 5. Alert triage (monitoring log lines → action)

The monitors live in `apps/api/src/api/services/monerium-b2b/monitoring.ts` (worker-run, every
30 min). All lines are prefixed `monerium-b2b:`.

| Log line contains | Meaning | Action |
|---|---|---|
| `PAUSE THRESHOLD — quote impact at minSwapAmount exceeds SLIPPAGE_BPS` | Executable depth below even minimum-size swaps (PRD §7.4 pause threshold); swaps would revert on minOut | Engage global pause (§1); investigate pool state (LP exit, depeg); consider lowering `perSwapCap`; re-run the T6 quote methodology before unpausing |
| `executable depth below perSwapCap` | Cap-sized swaps would revert; availability, not fund risk | Lower `perSwapCap` (§1) or accept keeper retries; watch for escalation to pause threshold |
| `ASSOCIATION CHANGE` | Monerium-side association diverged from the DB record (IBAN moved, address linked) — the S1 detective control | Treat as potential whitelabel-credential compromise: confirm with Monerium whether the change was authorized; if not: global pause, rotate `MONERIUM_B2B_CLIENT_SECRET`, ask for IBAN suspension (§2), full incident |
| `stranded EURe on forwarder` (warn ≥12h) | Keeper is not converting | Check worker liveness, RPC health, keeper gas balance, oracle staleness (swaps revert on `StalePrice`) |
| `stranded EURe ... past TRIGGER_DELAY` | ≥ TRIGGER_DELAY (registry P4) — permissionless trigger now live; SLA long since broken | Escalate keeper outage; anyone can call `swapAndForward()` now, which is acceptable (same policy applies); communicate delay to client |
| `config violation` / `bytecode is not the EIP-1167 clone` / `not registered on factory` | Should-be-impossible state (immutable feeBps changed, wrong code) | Full incident: global pause, run the manifest verifier, compare against the published manifest history |
| `reconciled owner-authorized config change` | Client's fallbackAddress rotated destination/fallback — expected transition (R07), DB updated | No incident. Confirm with the partner that the client intended it; an unexpected change suggests a compromised fallback key → client should `setClientPaused(true)` and rotate via `setFallbackAddress` |
| `MONERIUM_B2B_PRIVATE_RPC_URL is not set` | Keeper writes going through public mempool | Operational finding on mainnet — set the private orderflow RPC |

## 6. Key compromise quick reference

| Key | Blast radius | Response |
|---|---|---|
| Attestor | Can link addresses to profiles, never move funds | Rotate key; new forwarders need a new implementation deployment (ATTESTOR is immutable); existing links unaffected |
| Keeper | Can call `poke`/`swapAndForward` (policy-constrained) — no fund redirection possible | Rotate `MONERIUM_B2B_KEEPER_PRIVATE_KEY`; `setKeeper(old,false)` + `setKeeper(new,true)` on the factory |
| Guardian | Can pause/unpause and tune bounded params — delay-only | Two-step `transferGuardian`/`acceptGuardian` to a new key; audit pause state afterwards |
| Whitelabel API credentials | Control-plane: could move IBANs/links at Monerium (S1) | Rotate at Monerium; association monitor is the detective control; check its history for unauthorized changes |
| Client fallback key (client-side) | Full control of that client's funds/config | Client's own responsibility (terms); assist via partner: pause account, client rotates `setFallbackAddress` if still in control |
