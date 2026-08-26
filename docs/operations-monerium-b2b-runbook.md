# Monerium B2B Onramp — Operations Runbook

All operator procedures for the B2B onramp in one place: onboarding, incident response,
alert triage, dormancy, and client migration. Architecture:
[`architecture-monerium-b2b-onramp.md`](architecture-monerium-b2b-onramp.md); decisions
and parameters: [`adr-0005-monerium-b2b-onramp.md`](adr-0005-monerium-b2b-onramp.md);
security invariants:
[`security-spec/05-integrations/monerium-b2b.md`](security-spec/05-integrations/monerium-b2b.md).

Ground rules that shape every procedure here:

- **Vortex powers are delay-only.** Guardian/keeper can pause and execute the policy —
  never move or redirect funds. There is no Vortex-side rescue path by design.
- **Pauses never trap client funds.** `fallbackAddress` functions (`sweep`,
  `setDestination`, `setFallbackAddress`, `setClientPaused`) and the permissionless
  dead-man sweep (`sweepStrandedEure`, after 60 days) work while paused. Do not promise
  otherwise in comms.
- **Never send raw EURe to a CEX destination.** EURe recovery targets are
  `fallbackAddress` only.

## 1. Client onboarding

Deploy → manifest → verify → map → (automated: link + IBAN) → penny test → activate.
One pass per client. Prerequisites: guardian key funded on the target chain;
`MONERIUM_B2B_*` env set on the keeper backend; partner paperwork complete; the client
company onboarded and KYB-approved on Monerium's side (partner KYC reliance) with its
Monerium profile UUID at hand; the partner configured as a managed-profile manager
(`PUT /v1/admin/managed-profile-managers/:profileId`, corridor `EU`, customer type
`business`).

### 1.1 Paperwork inputs (from the partner agreement)

- `destination` — client's payout address. CEX deposit addresses allowed; validate:
  EIP-55 checksum, not zero/dead/precompile/token/router (the contract re-rejects
  token/router/self at init), warn-and-attest for contract addresses and CEX addresses
  (rotation risk — terms).
- `fallbackAddress` — client's **self-custodied** recovery address. Mandatory, no
  exceptions (Monerium acceptance condition). Must be distinct from custodial/CEX
  addresses.
- `feeBps` — per-client; pilot `0`, GA starting point 15 bps (ADR B1). Adjustable
  later via the guardian's timelocked setter.
- Signed terms including the redemption-limitation disclosure (rollout doc, Terms §1).

### 1.2 Deploy the forwarder clone

```bash
# predict, then deploy (guardian-only); salt = any unused bytes32, convention: client index
cast call $FACTORY "predictAddress(bytes32)(address)" $SALT --rpc-url $RPC
cast send $FACTORY "deployForwarder(address,address,uint16,bytes32)" \
  $DESTINATION $FALLBACK $FEE_BPS $SALT --rpc-url $RPC --private-key $GUARDIAN_KEY
```

The clone is initialized atomically in the deploy tx (`ForwarderDeployed` event).
Record the forwarder address + deploy tx hash.

### 1.3 Manifest: generate, verify, publish

From `contracts/monerium-forwarder/`:

```bash
bun script/generate-manifest.ts $FACTORY $RPC manifests/<chainId>-$FACTORY.json
bun script/verify-manifest.ts manifests/<chainId>-$FACTORY.json $RPC   # must PASS
```

(Some free RPCs refuse historical `eth_getLogs`; add `--logs-rpc <endpoint>` for the
event enumeration.) Publish the manifest (commit + public location). The manifest is
**consistency evidence, not a trust root**: it lets anyone detect silent changes; the
verified source on the block explorer is what proves the deployment honest — verify it
there as part of this step.

### 1.4 Map the client to a managed profile

One idempotent admin call creates the managed child (business entity under the partner
manager), imports the Monerium KYB approval, verifies the deployed clone on chain, and
records the account (status `onboarding`):

```
POST /v1/admin/monerium-b2b/accounts        (Authorization: Bearer $ADMIN_SECRET)
{
  "managerProfileId":  "<partner manager profile UUID>",
  "externalSubjectId": "<partner's immutable client id>",
  "contactEmail":      "<client ops contact>",
  "moneriumProfileId": "<Monerium profile UUID>",
  "forwarderAddress":  "<deployed clone>",
  "destination":       "<client payout address>",
  "fallbackAddress":   "<client self-custody recovery>",
  "feeBps":            0
}
```

Replaying the identical call is safe (200); divergent input is a 409, never an
overwrite.

### 1.5 Link + IBAN (automated)

The keeper's onboarding step picks up every mapped `onboarding` account and,
exactly-once via the profile-scoped `financial_operations` ledger: links the forwarder
with the attestor signature (`POST /addresses` — HTTP 201, `state: linked`, zero client
interaction), then requests IBAN issuance (`POST /ibans`, async 202). The IBAN lands on
the account row via the `iban.updated` webhook; from then on the association monitor
treats the DB record as the reference state. Nothing to do manually — verify the row
has its IBAN before the penny test, and check the logs if it stays empty for more than
a few cycles.

### 1.6 Penny test

Prove the destination actually credits contract-originated USDC transfers (CEXes can
rotate or mis-credit) before real volume flows:

1. Send a small SEPA deposit to the new IBAN (sandbox: dashboard → Receive → "Simulate
   bank transfer"). Target forward amount: 5 USDC (ADR B2).
2. The keeper converts automatically once the balance reaches `minSwapAmount`; for a
   sub-minimum penny test, temporarily lower `minSwapAmount` (guardian, bounded by the
   floor) or fund up to the minimum.
3. **Partner/client confirms credit at the destination** in writing (a terms diligence
   commitment).

### 1.7 Activate

```
PATCH /v1/admin/monerium-b2b/accounts/<accountId>/status    (Authorization: Bearer $ADMIN_SECRET)
{ "status": "active" }
```

(Refused with 409 while no IBAN is recorded.) Confirm the next monitoring pass picks
the account up cleanly, then hand the IBAN to the client via the partner.

Failure at any step: nothing is at risk — the forwarder holds no funds until the client
wires EUR, and every recovery path is live from deployment.

## 2. Incident response

### 2.1 Pause procedures

Guardian key = `MONERIUM_B2B_GUARDIAN_PRIVATE_KEY`; `$FACTORY` from the published
manifest.

```bash
# Per-clone pause (one client — compliance hold, dormancy, targeted issue)
cast send <forwarderAddress> "setGuardianPaused(bool)" true --rpc-url $RPC --private-key $GUARDIAN_KEY
# Global pause (all clones — protocol-level incident)
cast send $FACTORY "setGlobalPaused(bool)" true --rpc-url $RPC --private-key $GUARDIAN_KEY
# Availability lever: reduce the per-swap cap (instant, bounded by immutables)
cast send $FACTORY "setPerSwapCap(uint256)" <newCapRaw> --rpc-url $RPC --private-key $GUARDIAN_KEY
```

Both pauses block `swapAndForward` only; unpause = same call with `false`.

### 2.2 Monerium IBAN suspension ask

Per-IBAN suspension is **G1 item 7 — not yet contractual**; until the MSA settles it,
best-effort: contact Monerium support/emergency, identify the whitelabel partner
account and affected IBAN(s) + forwarder(s), ask for suspension of inbound SEPA
(deposits bounce to senders — NOT profile closure), record the ticket for the G1
negotiation record. While unsuspended, inbound SEPA keeps minting EURe to the forwarder
— safe behind the contract invariants, but growing exposure.

### 2.3 Client notification

Clients have no Vortex UI; comms run through the partner plus direct email: notify the
partner ops contact first; email affected clients (**stop sending EUR to your IBAN until
further notice**; deposits already sent convert after resolution or are recoverable via
the fallback address — nothing is lost by pausing); status page entry if global.

### 2.4 Critical-vulnerability sequence (the 02:00-UTC drill)

Suspected vulnerability in `VortexForwarder`/factory:

1. **Pause all** (`setGlobalPaused(true)`) — instant, protective-only, reversible.
2. **Ask Monerium to suspend affected IBANs** (§2.2) so no new EURe mints.
3. **Notify** partner + clients (§2.3).
4. **Assess.** Funds at risk = EURe balances on forwarders (stranded-balance monitor
   output, or `cast call <eure> "balanceOf(address)" <forwarder>`); run the manifest
   verifier against the live deployment.
5. **If funds must move: only clients can move them.** Instruct clients (via partner)
   to sweep EURe with their fallback key: `sweep(EURE, <their address>)` from
   `fallbackAddress` — provide exact calldata and a verification walkthrough. The
   issuer recovery backstop (burn + payout to the client's own bank account; validates
   the already-whitelisted ownership message) is the last resort.
6. **Ship the fix as a migration** (§5): new implementation + factory (new audit), new
   clones, re-link, move IBANs, penny-test, republish the manifest. Old clones stay
   paused; residual balances leave via fallback or dead-man sweep.
7. **Unpause / decommission** only contracts confirmed unaffected.

### 2.5 Whitelabel-credential compromise (S1)

On an unexplained `ASSOCIATION CHANGE` alert or any suspicion the Monerium credentials
leaked: treat as an active incident. First hour: (1) rotate the whitelabel client
secret at Monerium; (2) request IBAN suspension for affected accounts (§2.2);
(3) notify the partner to halt client sends; (4) global pause is optional — on-chain
funds are not at risk, only *future* mints can be redirected. Then reconcile: diff
Monerium-side links/IBANs against the DB for every account, treating the association
monitor's history as the timeline. Blast radius = deposit flow between the unauthorized
change and suspension.

## 3. Alert triage (monitoring log lines → action)

Monitors run from the keeper worker every ~30 min; lines are prefixed `monerium-b2b:`.

| Log line contains | Meaning | Action |
|---|---|---|
| `PAUSE THRESHOLD — quote impact at minSwapAmount exceeds SLIPPAGE_BPS` | Executable depth below even minimum-size swaps; swaps would revert on minOut | Global pause (§2.1); investigate pool state (LP exit, depeg); consider lowering `perSwapCap`; re-run the liquidity-baseline methodology before unpausing |
| `executable depth below perSwapCap` | Cap-sized swaps would revert; availability, not fund risk | Lower `perSwapCap` or accept keeper retries; watch for escalation |
| `ASSOCIATION CHANGE` | Monerium-side association diverged from the DB (IBAN moved, address linked) — the S1 detective control | §2.5 — potential credential compromise unless the change was an announced migration (§5) |
| `stranded EURe on forwarder` (warn ≥12h) | Keeper is not converting | Check worker liveness, RPC health, keeper gas, oracle staleness (`StalePrice` reverts) |
| `stranded EURe ... past TRIGGER_DELAY` | Permissionless trigger now live; SLA long broken | Escalate the keeper outage; anyone may call `swapAndForward()` (same policy applies); communicate the delay |
| `config violation` / `bytecode is not the EIP-1167 clone` / `not registered on factory` | Should-be-impossible state | Full incident: global pause, manifest verifier, compare against manifest history |
| `reconciled owner-authorized config change` | Client rotated destination/fallback, or a guardian fee change applied — expected, DB updated | No incident. Unexpected destination change → confirm with the partner; a surprise suggests a compromised fallback key (client should `setClientPaused(true)` and rotate) |
| `onboarding advance failed` (repeating for one account) | Link/IBAN automation stuck | Check the `financial_operations` row: `failed` retries itself; `unknown` needs manual reconciliation (compare Monerium-side state, then update the row) |
| `delivery ... abandoned after N attempts` | Partner webhook endpoint down > backoff horizon | Contact partner; deliveries are not retried after abandonment — partner should poll `GET /v1/monerium-b2b/deposits` to catch up |
| `MONERIUM_B2B_PRIVATE_RPC_URL is not set` | Keeper writes in the public mempool | Set the private orderflow RPC (operational finding on mainnet) |

## 4. Dormancy gate

Why: CEX rotation risk concentrates in dormant accounts — an exchange silently rotates
a deposit address; months later a deposit arrives and USDC would be forwarded to an
address the client no longer controls. The gate converts that silent loss into a pause.

**Automatic:** an `active` account with no confirmed conversion for 60 days is paused
(`setGuardianPaused(true)` with the guardian key; log-only if the key is unset) and
`dormant_since` is recorded; the conversion executor skips it (the stranding marker
still arms — the dead-man sweep clock is unaffected). EURe arriving during dormancy
accumulates safely; past the sweep delay it flows to `fallbackAddress` automatically.

**Re-confirmation (manual, via partner):** partner re-confirms in writing that the
destination is valid and client-controlled (ADR B5). If the destination changed, the
**client** updates it via their fallback key (`setDestination`) — Vortex cannot and must
not — and CEX destinations re-run the penny test. Archive the confirmation.

**Un-pause (both steps, always):**

```bash
cast send <forwarderAddress> "setGuardianPaused(bool)" false --rpc-url $RPC --private-key $GUARDIAN_KEY
```

```sql
UPDATE monerium_accounts SET dormant_since = NULL WHERE forwarder_address = '<forwarderAddress>';
```

The DB flag, not the chain flag, gates the executor — un-pausing without clearing
`dormant_since` leaves the account skipped. Verify: a `SwapExecuted`, the execution row
`confirmed`, no stranded alert on the next pass. Never un-pause to "flush" a balance
without re-confirmation — that balance is exactly the rotation-risk scenario.

## 5. Client migration to a new clone (manual; tooling = ADR O1, build when needed)

For contract upgrades or config changes that require a new clone. **Announce first**:
record the migration (account id, old/new forwarder, window) so the association
monitor's alerts are expected, then:

1. Deploy the new clone (§1.2) and verify it (`isForwarder` + config read-back —
   Vortex tooling only ever targets factory clones).
2. Let the keeper drain the old clone (or client sweeps the remainder via fallback).
3. Link the new clone to the same Monerium profile (attestor flow — automated once the
   account row's forwarder is repointed, or manual `POST /addresses`).
4. Move the IBAN: `PATCH /ibans/{iban}` with the new address — this is the
   S1-sensitive operation; it must only ever happen inside an announced migration.
5. Update the `monerium_accounts` row (forwarder address), penny-test the new clone,
   re-activate.

There is no unlink at Monerium and no custodial parking position: EURe always mints to
the IBAN's current default address; the old clone stays linked but inert.

## 6. Key compromise quick reference

| Key | Blast radius | Response |
|---|---|---|
| Attestor | Can link addresses to profiles; never move funds (recovery payouts go only to the client's own bank account) | Rotate key; new forwarders need a new implementation (ATTESTOR is immutable); existing links unaffected |
| Keeper | `poke`/`swapAndForward` only (policy-constrained); worst case gas theft | Rotate; `setKeeper(old,false)` + `setKeeper(new,true)`; refund gas |
| Guardian | Pause/unpause, bounded params, timelocked fee — delay-only griefing | Two-step `transferGuardian`/`acceptGuardian`; audit pause + pending-fee state after |
| Whitelabel API credentials | Control-plane: can re-link/move IBANs (future mints only) — S1 | §2.5 full sequence |
| `ADMIN_SECRET` | Map/suspend accounts (mapping is bounded by on-chain clone verification) | Rotate; audit recent admin mutations |
| Webhook HMAC secret | Fabricated inbound order events (accounting noise; forward-only lattice + mint watcher bound the damage) | Rotate at both ends; reconcile deposits against chain |
| Client fallback key (client-side) | Full control of that client's funds/config | Client's own responsibility (terms); assist via partner: pause the account; client rotates `setFallbackAddress` if still in control |
