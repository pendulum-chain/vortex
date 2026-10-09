# Monerium B2B Onramp — Operations Runbook

All operator procedures for the B2B onramp in one place: onboarding, incident response,
alert triage, dormancy, client migration, and the Sepolia sandbox bring-up (§8). Architecture:
[`architecture-monerium-b2b-onramp.md`](architecture-monerium-b2b-onramp.md); decisions
and parameters: [`adr-0005-monerium-b2b-onramp.md`](adr-0005-monerium-b2b-onramp.md);
security invariants:
[`security-spec/05-integrations/monerium-b2b.md`](security-spec/05-integrations/monerium-b2b.md).

Ground rules that shape every procedure here:

- **Vortex powers are bounded, not custodial by default.** Guardian/keeper can pause,
  execute the policy (chunk swaps, one forward per payment) and — only for a payment
  whose batch has been open for `RECOVERY_DELAY` (2 h) — move that payment to the
  client's refund wallet fixed in the clone for a bank refund (§2.7). Nothing else can
  move funds, and nothing can redirect them: the clone pays the client's destination,
  the fee treasury and the client's refund wallet, full stop.
- **Pauses block swaps and forwards, never a recovery.** Pause-then-recover is the
  incident sequence. Past 24 h anyone may swap and forward permissionlessly, so a
  pause plus a dead keeper still cannot trap converted funds. There is no client key
  on the clone any more (ADR amendment 2026-09-17).
- **The subsidy vault holds Vortex money only.** It tops a chunk up to the floor on the
  clone (the top-up is forwarded with the payment), within its caps, and withdraws only
  to the treasury; funding, limits and pause are ordinary operations (§2.6), never a
  client-funds question.
- **Never send raw EURe to a CEX destination.** EURe leaves a clone only to the router
  or the client's refund wallet.
- **Run migrations from one deployment instance only.** Migration 080 refuses to run
  while an execution from the former allocation model spans several deposits; reconcile
  such rows by hand rather than guessing an attribution.

## 1. Client onboarding

**Partner registration (default).** The partner calls `POST /v1/monerium-b2b/accounts`
with the client's Monerium profile ID, destination, client reference and contact email;
the keeper waits for Monerium's approval, deploys the clone with the deployer key, maps
the account and runs §1.5. The operator's only step is activation (§1.7); only the
sandbox (`SANDBOX_ENABLED=true`, §8) activates a registered account by itself once its
IBAN is recorded. The partner follows a registration in
`GET /v1/monerium-b2b/registrations`. Operators list the same rows with the keeper's
progress (`id`, `contactEmail`, `managerProfileId`, `deployTxHash`, `deploySentAt`,
`lastCheckedAt`) with `GET /v1/admin/monerium-b2b/registrations?status=requested|mapped|rejected`
(`limit`, `offset`; `Authorization: Bearer $ADMIN_SECRET`), no SQL needed.

A `requested` registration shows what it waits for in `waitingReason`:

| `waitingReason` | Meaning | Who acts |
|---|---|---|
| `monerium_profile_pending` | Monerium reports the profile `created`, `incomplete`, `pending` or `review`; the keeper re-reads it every minute | The partner, at Monerium (finish the KYB); nothing at Vortex |
| `monerium_profile_not_visible` | Monerium now answers 404 for the profile in the partner's app, though it was visible when the partner registered it | The partner checks that the profile still exists in its app; if it persists, Vortex checks that the white-label credentials are still the partner's app |
| `deployment_pending` | The profile is approved and the deployment is sent (`deployTxHash`, `deploySentAt`) or queued behind another one (one deployment per cycle); with no receipt after 10 minutes, or after a revert, it is sent again | Nobody; if it outlasts a few cycles, check the deployer's pending nonce and the RPC |
| `deployer_not_ready` | The deployer cannot deploy: no deployer role on the factory (`NotDeployer`) or no gas. Vortex's side, never the partner's | Vortex: `setDeployer` (§8.5) or fund the deployer address; the next cycle proceeds |
| `manager_inactive` | The mapping is refused because the partner's managed-profile manager is inactive or missing | Vortex: restore the manager (`PUT /v1/admin/managed-profile-managers/:profileId`, corridor `EU`, customer type `business`) |
| `temporary_error` | A transient failure: RPC, Monerium (timeout, rate limit, 5xx, 403), the mapping's on-chain verification, or the database; the keeper retries every cycle | Vortex only if it persists: the log line `registration for profile ... failed this cycle` names the cause |

A registration becomes `rejected`, with a reason the partner can read, only for a
definite cause: Monerium rejected or closed the profile; the factory refused the
arguments (`InvalidConfigAddress`, `ZeroAddress`, `InvalidFeePolicy`, §1.1); a client
conflict (the client reference already used with another contact email, by a client
that is not a business or with another Monerium profile; the contact email used by
another client; another registration that is not rejected with the same reference or
email); a definite mapping conflict; an operator mapped the profile by hand to a
different destination or for another manager's client; the guardian revoked the clone
at the predicted address (the same destination would always land on it); or an operator
withdrew it. Transient failures wait instead. The
partner may register a rejected profile again, with the same or corrected data (202; the
row restarts).

To stop a registration that must not proceed (a partner typo, a wrong destination, a
clone you revoked), withdraw it: `POST /v1/admin/monerium-b2b/registrations/<id>/withdraw`
turns a `requested` registration into `rejected` with the reason "Withdrawn by Vortex
operations: register the profile again with corrected data" (409
`MONERIUM_B2B_REGISTRATION_NOT_WITHDRAWABLE` when it is mapped or already rejected, 404
`MONERIUM_B2B_REGISTRATION_NOT_FOUND`); the partner registers the profile again. The
keeper deploys as soon as Monerium approves the profile, so withdraw before that; a clone
already deployed for a withdrawn registration stays unused (no IBAN is linked to it) and
the guardian may revoke it (§6). A withdrawal always wins over a keeper cycle running at
the same time: the keeper writes only to the row it loaded and locks it while it maps.

The manual path below stays for corrections and clients registered outside the API.
Mapping a profile by hand while its registration is still `requested` is safe: the keeper
adopts the account when the destination matches and the account belongs to one of the
registering manager's clients, and rejects the registration otherwise, without deploying
a second clone.

Deploy → manifest → verify → map → (automated: link + IBAN) → activate → optional penny
test.
One pass per client. Prerequisites: guardian key funded on the target chain;
`MONERIUM_B2B_ENABLED=true` and the complete `MONERIUM_B2B_*` env set on the one
`mykobo` keeper backend (including the trusted factory address, read/private RPCs,
webhook secret, and three keys); the factory's subsidy vault deployed, pointed at and
funded (§2.6); the client company onboarded and KYB-approved on Monerium's side with
its Monerium profile UUID at hand; the partner configured as a managed-profile manager
(`PUT /v1/admin/managed-profile-managers/:profileId`, corridor `EU`, customer type
`business`).

### 1.1 Client inputs

- `destination` — client's payout address. CEX deposit addresses allowed; validate by
  hand: EIP-55 checksum, not zero/dead/precompile/token/router, warn-and-attest for
  contract addresses and CEX addresses (rotation risk). Nothing else screens
  them: the registration API rejects only a malformed or zero address (400), and the
  factory refuses at init (the registration is rejected) only EURe, EURC, USDC, the
  router, the clone itself and the client's own refund wallet. A dead or precompile
  address deploys and would receive the client's USDC.
- (No client-held recovery address: the clone's `recoveryAddress` is the client's refund
  wallet, derived by Vortex, step 1.2. The destination has no setter — a client wallet
  change is a new clone, §5 — so get it right; a penny test is recommended for exchange
  destinations.)
- `targetPpm` / `floorPpm` — the client's fee policy in ppm below the reference rate;
  Vortex's default policy 1250 / 1500 (12.5 / 15 bps, ADR B1). Adjustable later via
  the guardian's timelocked `setFeePolicy` (raising either value waits 24 h).

### 1.2 Deploy the forwarder clone

```bash
# the client's refund wallet, derived from MONERIUM_B2B_REFUND_SEED and the Monerium profile ID
curl -s -H "Authorization: Bearer $ADMIN_SECRET" \
  "$API/v1/admin/monerium-b2b/refund-address?moneriumProfileId=$MONERIUM_PROFILE_ID"
# predict, then deploy (guardian or a factory deployer); salt = any bytes32, convention: client index
cast call $FACTORY "predictAddress(address,address,uint32,uint32,bytes32)(address)" \
  $DESTINATION $REFUND_ADDRESS $TARGET_PPM $FLOOR_PPM $SALT --rpc-url $RPC
cast send $FACTORY "deployForwarder(address,address,uint32,uint32,bytes32)" \
  $DESTINATION $REFUND_ADDRESS $TARGET_PPM $FLOOR_PPM $SALT --rpc-url $RPC --private-key $GUARDIAN_KEY
```

The factory deploys at the CREATE2 salt
`keccak256(abi.encode(destination, recoveryAddress, targetPpm, floorPpm, salt))`, so
`predictAddress` takes the very arguments of `deployForwarder`, and nobody can occupy a
client's predicted address with other arguments. The same arguments with the same salt
twice revert (`CloneFailed`); use a fresh salt for a second clone of one configuration.

The clone is initialized atomically in the deploy tx (`ForwarderDeployed` event). The
refund wallet is fixed for the clone's lifetime; the account mapping (§1.4) refuses a
clone whose `recoveryAddress` is not this client's derived wallet.
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
  "targetPpm":         1250,
  "floorPpm":          1500
}
```

Replaying the identical call is safe (200); divergent input is a 409, never an
overwrite. If the partner's registration for this profile is still `requested`, the
keeper marks it mapped on its next cycle when the destination matches and rejects it when
it differs; it never deploys a second clone for an account that exists.

### 1.5 Link + IBAN (automated)

The keeper's onboarding step picks up every mapped `onboarding` account and,
exactly-once via the profile-scoped `financial_operations` ledger: links the forwarder
with the attestor signature (`POST /addresses` — HTTP 201, `state: linked`, zero client
interaction), links the client's refund wallet with its own signature, then requests IBAN
issuance for the forwarder (`POST /ibans`, async 202). The IBAN lands on
the account row via the `iban.updated` webhook (the log says `account ... has its
IBAN`); from then on the association monitor treats the DB record as the reference
state, and the onboarding step stops polling the account: it only awaits activation
(§1.7). Nothing to do manually — verify the row has its IBAN before activation, and check
the logs if it stays empty for more than a few cycles.

### 1.6 Penny test (optional)

Optional, and recommended for exchange destinations (ADR amendment 2026-09-29): prove
the destination actually credits contract-originated USDC transfers (CEXes can rotate
or mis-credit) before real volume flows. Run it right after activation (§1.7), before
the client starts paying: only an active account converts, so a penny test sent earlier
waits on the clone and is refunded at the deadline (§1.7), which reads as a failed
destination test.

1. Send a small SEPA deposit to the new IBAN (sandbox: dashboard → Receive → "Simulate
   bank transfer"). Target forward amount: 5 USDC (ADR B2).
2. The keeper converts it like any other payment (the minimum swap is €1).
3. **Partner/client confirms credit at the destination** in writing.

### 1.7 Activate

Activation is the operator's check of the destination, and it gates the money: only an
active account converts. A payment that reaches an account before activation waits on
the clone, and the partner sees waiting reason `account_not_active` on the deposit. With
`MONERIUM_B2B_AUTO_RECOVERY=auto` the deadline (`MONERIUM_B2B_RECOVERY_DEADLINE_MINUTES`,
120 by default, counted from the mint) then refunds it; in `alert` mode the keeper only
logs `REFUND DUE` and in `off` mode (the default) it does nothing, so mark the deposit
by hand (§2.7). The gate is a keeper-side policy, not an on-chain guarantee: once the
clone's batch has been open for `TRIGGER_DELAY` (24 h), `swap` and `forwardAll` are
permissionless and anyone can send the payment to the unchecked destination, so activate
or refund well before that.

1. Find the accounts waiting for activation, with their partner manager:
   `GET /v1/admin/monerium-b2b/accounts?status=onboarding` (Authorization: Bearer
   $ADMIN_SECRET). Entries with an `iban` wait for you; those without are still linking
   (§1.5).
2. Check the account's `destination` against the address the partner confirmed in
   writing; it can never change.
3. Activate:

```
PATCH /v1/admin/monerium-b2b/accounts/<accountId>/status    (Authorization: Bearer $ADMIN_SECRET)
{ "status": "active" }
```

(Refused with 409 while no IBAN is recorded.) Activation records `activated_at`: the
60-day dormancy window (§4) of a never-converted account runs from it, so a late
activation does not pause the account at once. Every status change is logged
(`operator moved account <id> from <from> to <to>`, with destination and forwarder); the
log names no operator, since the admin secret is shared. Run the penny test (§1.6) if the
destination is an exchange, confirm the next monitoring pass picks the account up
cleanly, then tell the partner the account is active; `ACCOUNT_UPDATED` reports it too.

If the destination does not match, suspend the account instead
(`{ "status": "suspended" }`, allowed from `onboarding` once the IBAN is issued): nothing converts, recoveries
still run, and `ACCOUNT_UPDATED` tells the partner. Mark any payment already on the clone
for the refund path (§2.7).

**Before deploying the gate to a backend that already holds accounts**, list the accounts
in `onboarding` that already have an IBAN (the same call; `iban` not null). They converted
before the gate and stop converting once it is live, so a payment would sit on the clone.
Run the check above for each and activate it, or leave it idle on purpose.

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
# Route lever: disable a route whose pool went bad (indices are stable; the keeper re-quotes each cycle)
cast send $FACTORY "setRouteEnabled(uint256,bool)" <index> false --rpc-url $RPC --private-key $GUARDIAN_KEY
# Subsidy lever: stop topping up (below-floor swaps then defer instead of executing)
cast send $VAULT "setPaused(bool)" true --rpc-url $RPC --private-key $GUARDIAN_KEY
```

Both pauses block `swap`, `forward` and `forwardAll` only — never `recover`; unpause =
same call with `false`. Pausing the vault pauses nothing on the forwarders: swaps that
need no subsidy keep executing.

### 2.2 Monerium IBAN suspension ask

Contact Monerium support/emergency, identify the whitelabel partner account and
affected IBAN(s) + forwarder(s), ask for suspension of inbound SEPA (deposits bounce to
senders — NOT profile closure), and record the ticket. While unsuspended, inbound SEPA
keeps minting EURe to the forwarder — safe behind the contract invariants, but growing
exposure.

### 2.3 Client notification

Clients have no Vortex UI; comms run through the partner plus direct email: notify the
partner ops contact first; email affected clients (**stop sending EUR to your IBAN until
further notice**; deposits already sent convert after resolution or are refunded to the
sending bank account through the recovery path — nothing is lost by pausing); status
page entry if global.

### 2.4 Critical-vulnerability sequence (the 02:00-UTC drill)

Suspected vulnerability in `VortexForwarder`/factory:

1. **Pause all** (`setGlobalPaused(true)`) — instant, protective-only, reversible.
2. **Ask Monerium to suspend affected IBANs** (§2.2) so no new EURe mints.
3. **Notify** partner + clients (§2.3).
4. **Assess.** Funds at risk = EURe balances on forwarders (stranded-balance monitor
   output, or `cast call <eure> "balanceOf(address)" <forwarder>`); run the manifest
   verifier against the live deployment.
5. **If funds must move: the refund path.** Mark every open deposit for recovery
   (§2.7); once each clone's batch is 2 h old the keeper moves the funds to that
   client's refund wallet and the payments are refunded to the payers' bank accounts. The
   issuer recovery backstop (burn + payout to the client's own bank account; validates
   the already-whitelisted ownership message) is the last resort.
6. **Ship the fix as a migration** (§5): new implementation + factory (new audit), new
   clones, re-link, move IBANs, optionally penny-test, republish the manifest. Old clones stay
   paused; residual balances leave through the refund path.
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

### 2.6 Subsidy vault operations

One `VortexSubsidyVault` per factory, deployed once (USDC, the fee Safe as treasury, the
factory, launch limits 50 bps per swap and 200 USDC per day — ADR P13), then pointed at
by the factory and funded from the treasury. All guardian-key calls are ordinary
operations: the vault never holds client funds.

```bash
# once: point the factory at the vault
cast send $FACTORY "setSubsidyVault(address)" $VAULT --rpc-url $RPC --private-key $GUARDIAN_KEY
# fund (from the treasury Safe): plain USDC transfer to $VAULT
# tune limits (instant)
cast send $VAULT "setMaxSubsidyPpm(uint32)" 5000 --rpc-url $RPC --private-key $GUARDIAN_KEY
cast send $VAULT "setDailyBudget(uint256)" 200000000 --rpc-url $RPC --private-key $GUARDIAN_KEY
# read runway
cast call $VAULT "dailyBudget()(uint256)" --rpc-url $RPC
cast call $VAULT "spentToday()(uint256)" --rpc-url $RPC
cast call $USDC "balanceOf(address)(uint256)" $VAULT --rpc-url $RPC
# return funds (treasury only — there is no other target)
cast send $VAULT "withdraw(uint256)" <amountRaw> --rpc-url $RPC --private-key $GUARDIAN_KEY
```

Sizing: the vault's per-swap cap must be at least the subsidy ladder's top (100 bps, so
`setMaxSubsidyPpm(10000)` at launch), because the keeper's tier is the effective cap and
the vault's is the ceiling. At the €10k per-swap cap a top-up at the ladder's top is
about 115 USDC, so size the daily budget from the expected number of chunks that reach
the late tiers, not from one worst case; raise the budget or lower `perSwapCap` if
deferrals become routine; both are instant. The ladder itself
(`MONERIUM_B2B_SUBSIDY_LADDER`, seconds:bps steps) and the re-quote cadence
(`MONERIUM_B2B_KEEPER_CYCLE_SECONDS`) are backend settings; tune the ladder from the
`deferring conversion ... shortfall N bps, tier M bps` log lines.

### 2.7 Refund (recovery) procedure

Trigger: a deposit the promised window was missed on (the deadline,
`MONERIUM_B2B_RECOVERY_DEADLINE_MINUTES`, 120 by default), a remainder below
`minSwapAmount`, a compliance decision, or a critical incident (§2.4). Prerequisites: the
client's refund wallet (the clone's `recoveryAddress()`) is linked to the client's
Monerium profile (onboarding does this, §1.5), `MONERIUM_B2B_REFUND_SEED` and the EURe
float wallet's key are in the operator's custody, and the float holds EURe and some ETH
(it also pays the refund wallet's gas).

**Automation.** `MONERIUM_B2B_AUTO_RECOVERY` selects the mode: `off` (default) leaves
every step below to the operator; `alert` logs `REFUND DUE` for deposits past
`MONERIUM_B2B_RECOVERY_DEADLINE_MINUTES` (120, counted from the mint) and nothing else;
`auto` marks them, and — with `MONERIUM_B2B_FLOAT_PRIVATE_KEY` set and the seed deriving
the clone's `recoveryAddress` — runs steps 2–6 itself, one refund at a time per client
(different clients' refunds run side by side), reporting through the refund monitor (§3).
Start on `alert`, switch to `auto` once a sandbox refund has been observed end to end.
What stays manual in `auto`: refunds of EUR 15,000 or more (Monerium's supporting
document), deposits whose issue order carried no payer IBAN/name, orders Monerium
rejects, and any step that failed five times — all park the deposit as
`recovery_failed` with the phase preserved (`monerium_recoveries.phase`/`error`).
After five failed attempts, fix the cause, then
`PATCH .../deposits/<id>/status {"status": "recovering"}` resumes from that phase.
The other parks stay manual (EUR 15,000 or more, no payer, a rejected order): do not set
`recovering`, the next cycle would park it again (a rejected order stays rejected, and
the memo lookup adopts it again). Address the rejection reason if there is one, place
the redeem order by hand (step 5) under the memo `vortex-refund:<depositId>`, so no
automated retry can place a second order, and once Monerium processed it close the
deposit straight from `recovery_failed` with `{"status": "refunded"}` (step 6); the
keeper then closes the recovery without placing an order. While a client's refund is `recovery_failed` only that client's later
refunds wait behind it; other clients' refunds go on. The shared EURe float sends for one
client per keeper cycle, and an unconfirmed float transfer delays another client's float
step (a parked refund never does). Other clients advance one step per keeper cycle, and
a cycle can last several minutes, since each receipt wait times out after 3 minutes and a float step can wait on more than one.

**Hand sends from the float key (steps 3 and 4).** In `auto` the keeper keeps sending from
the same float key for other clients' refunds while one is parked, so a transfer you send
by hand can take the same nonce as a keeper transfer and one of the two is dropped. A
dropped keeper top-up leaves its client in `topping_up` and holds the float for every
client until that refund is parked. Cheaper option: first confirm that no other deposit is
`recovering` (a refund in `swapping`, or a confirmed `recover` with no recovery row yet,
starts sending from the float within a cycle or two) and that no float transaction is in
flight (the float's pending nonce equals its latest nonce). The result is a snapshot, so
the hand send must follow right after it:

```sql
SELECT id, account_id FROM monerium_fiat_deposits
WHERE status = 'recovering' AND id <> '<depositId>';
```

Alternative: set `MONERIUM_B2B_AUTO_RECOVERY=alert`; this needs a restart and pauses every
client's refunds, and it also silences the refund monitor and the orchestrator's refund
alerts (`REFUND FAILED`, `waits for the operator`) for every client, so set `auto` again
right after the hand step. Even then, first confirm no float transaction is pending: one
sent before the restart can still collide with the hand send. Before parking a `topping_up`
refund by hand, check the float's pending nonce, or cancel or replace the stuck transfer,
then park: parking releases the float for the other clients while that transfer may still
be pending. If its float top-up was dropped, park the refund, clear its hash (`UPDATE monerium_recoveries SET float_topup_tx_hash = NULL WHERE deposit_id = '<depositId>';`), then set it back to `recovering` (§2.7): a `topping_up` refund without a hash returns to `swapped` and re-derives the top-up from balances, so no hand send is needed.

1. **Mark the deposit.** `POST /v1/admin/monerium-b2b/deposits/<depositId>/recover`
   (`Authorization: Bearer $ADMIN_SECRET`). Refused (409) while a keeper transaction for
   the deposit is pending — retry once it settled — or when the deposit is not
   `minted`/`converting`. The deposit becomes `recovering`; the keeper stops chunking it.
2. **Wait for the keeper's `recover`.** It sends `recover(eureRemaining, usdcConverted)`
   once the clone's `batchOpenedAt` is `RECOVERY_DELAY` old (the contract refuses
   earlier; younger deposits keep converting meanwhile). Verify the `recover` execution
   row is `confirmed` and the `Recovered(eure, usdc)` event amounts match:

   ```sql
   SELECT kind, eure_in_raw, usdc_net_raw, tx_hash, status, error
   FROM monerium_conversion_executions WHERE deposit_id = '<depositId>' ORDER BY created_at;
   ```

3. **Swap the USDC back** from the client's refund wallet (its key derived from the seed
   and the Monerium profile ID; fund it with a little ETH first) over the reverse whitelisted route
   (USDC → EURC → EURe on the same pools; `exactInput` on the router with a
   Chainlink-derived minimum, 60 bps tolerance), or leave the USDC in the refund
   wallet and let the float cover the whole difference when the market is thin.
4. **Top up from the float:** transfer `issueAmount − EURe on the refund wallet` EURe
   from the float wallet to the refund wallet. Book that amount as the refund's
   subsidy; book any EURe surplus from step 3 to the treasury.
5. **Redeem the exact amount.** `POST /orders` from the refund wallet: `kind: redeem`,
   `amount` = the issue order's `amount` string, `counterpart.identifier.iban` = the issue
   order's `counterpart.identifier.iban`, `details.companyName` = its `details.name`
   (individual payers: `firstName`/`lastName`), `country` from the IBAN prefix, `memo`
   `vortex-refund:<depositId>` (the key the automation checks before placing), the
   message `Send EUR <amount> to <iban> at <minute>`
   signed by the refund wallet's key; attach `supportingDocumentId` from EUR 15,000 (one
   standing document per client can be uploaded once and reused for its refunds). Monerium
   pays the refund out of the client's own IBAN. Watch `order.updated` for `processed`.
   Monerium may review a redeem order during business hours before paying it out; the
   payout goes by SEPA Instant where the payer's bank supports it, otherwise the next
   business day.
6. **Close the deposit.** `PATCH /v1/admin/monerium-b2b/deposits/<depositId>/status`
   with `{"status": "refunded"}`, from `recovering` or `recovery_failed`; use
   `recovery_failed` when a step cannot complete (and `recovering` again to retry later).
   Record deposit id, recover tx, reverse-swap tx,
   float top-up, redeem order id and payer IBAN (masked) in the ops ledger.

**Memo-routed payment** (no deposit row; found through the §3 warning `webhook order ...
references unknown forwarder address`). Look the order up at Monerium by the id in the
warning: it gives the amount, the address it minted to, and the payer's IBAN and name. If
that address is an old clone (§5), `poke()` it, wait for `RECOVERY_DELAY` (2 h), and have
the keeper `recover` the EURe to that clone's refund wallet; an old refund wallet from a
seed rotation (§6) needs the old seed's key. Then redeem the exact amount from the refund
wallet to the payer as in step 5, with a memo naming the issue order instead of a deposit
(`vortex-refund:` is reserved for deposits). On the client's current refund wallet, do
this before the client's next refund starts: that refund treats any EURe on the wallet as
surplus and sweeps it to the float, from where it must first be moved back. Record the
order id, recover tx (if any) and redeem order id in the ops ledger.

## 3. Alert triage (monitoring log lines → action)

Monitors run from the keeper worker every ~30 min; lines are prefixed `monerium-b2b:`.

| Log line contains | Meaning | Action |
|---|---|---|
| `DEPTH BELOW FLOOR — raw quote impact at minSwapAmount exceeds SLIPPAGE_BPS` | Even minimum-size fills land below Chainlink − 60 bps on every route before settlement. The floor is enforced on the client's net, so the keeper still executes while the vault covers the shortfall (up to the per-swap cap; beyond it the keeper defers and logs `deferring conversion`), but every swap of that size now costs a subsidy and the unsubsidized permissionless path would revert | Investigate pool state (LP exit, depeg) and watch the vault spend (§2.6); whitelist a better route or lower `perSwapCap`; global pause (§2.1) if it is a depeg or the vault is being drained; re-run the liquidity-baseline methodology before trusting the route again |
| `raw quote impact at perSwapCap exceeds SLIPPAGE_BPS` | Cap-sized swaps would need a vault subsidy; availability and vault spend, not fund risk | Lower `perSwapCap`, add a route, or accept the subsidies; watch for escalation |
| `deferring conversion for account` | The keeper declined to swap this cycle; the reason follows: `reference rate unavailable` (Coinbase unreachable, a malformed ticker, or `spread of N bps exceeds 50 bps` — a thin book; check egress and the venue), `outside the ... band around Chainlink` (EURC/EUR basis or a stale Chainlink round), `exceeds the current tier` (normal while the chunk waits for the market; the line names the shortfall and the tier), `projected subsidy ... exceeds` cap/budget/balance (§2.6: fund, raise limits, or wait for the market), `below the oracle floor` (only on the permissionless path since 2026-09-18: keeper swaps are settled up to the Chainlink floor by fee and tier-bounded subsidy, or defer on the tier/cap lines above), `no enabled swap route could be quoted` or `the factory has no enabled swap route` (§2.1 route lever) | Funds wait with the batch marker open; a deferral that outlives the 2 h window means the payment is refunded (§2.7) rather than converted late — communicate; after 24 h the permissionless path can execute unsubsidized |
| `SUBSIDY VAULT —` (error) | Vault paused or empty: every below-floor swap defers | §2.6: fund or unpause; check why it emptied (budget too high for the market?) |
| `subsidy vault ... refill before below-floor swaps start deferring` | Less than a day of budget left, or today's budget spent | §2.6 refill; consider the budget vs. observed spreads |
| `no subsidy vault is configured on the factory` | `setSubsidyVault` never ran; below-floor swaps defer | §2.6 |
| `route ... could not be quoted` | One whitelisted route's pool is unquotable (drained, removed) | Disable it (§2.1) so the keeper stops trying; keep at least one healthy route |
| `webhook order ... references unknown forwarder address, skipping` (warn) | An issue order minted to an address that is no account's forwarder: usually a payment memo-routed to a client's refund wallet, or to an old clone or refund wallet after a migration or seed rotation | Refund it by hand: §2.7, "Memo-routed payment" |
| `ASSOCIATION CHANGE` | Monerium-side association diverged from the DB (IBAN moved, an address other than the forwarder and the client's own refund wallet linked) — the S1 detective control | §2.5 — potential credential compromise unless the change was an announced migration (§5) |
| `stranded funds on forwarder ... past RECOVERY_DELAY` (warn) | A batch has been open longer than the promised 2 h window and is neither forwarded nor recovering | Check worker liveness, RPC health, keeper gas, oracle staleness (`StalePrice` reverts), `deferring conversion` lines; if the payment cannot complete, mark it for recovery (§2.7) |
| `stranded funds ... past TRIGGER_DELAY` (error) | Permissionless path now live; the promised window long missed (keeper outage or a persistent deferral) | Escalate; anyone may call `swap(reference, route, amountIn)` and `forwardAll()` — that path prices against Chainlink and pays no subsidy; communicate the delay |
| `REFERENCE VENUE —` (error) | The Coinbase product the reference reads is delisted or halted; every keeper swap defers silently | Change `COINBASE_REFERENCE_PRODUCT` (a live EURC market), redeploy the backend; the venue is an operational, not an on-chain, setting |
| `REFUND DUE — deposit ...` (error, `alert` mode) | A deposit outlived the promised window and the mode only reports | Mark it (§2.7 step 1) or switch to `auto` |
| `REFUND FAILED — deposit ... in phase ...` (error) | A refund step cannot complete automatically (large amount, missing payer, rejected order, five failed attempts) | §2.7: after five failed attempts, fix the cause and set the deposit back to `recovering`; otherwise refund by hand under the memo and close the deposit as `refunded`. A hand send from the float key can collide with the keeper's float sends for other clients: first confirm no other deposit is `recovering` and no float transaction is in flight, then send right away (the check is a snapshot), or set `MONERIUM_B2B_AUTO_RECOVERY=alert` (needs a restart, pauses every client's refunds and silences the refund alerts for every client; set `auto` again right after the hand step) |
| `could not be parked as recovery_failed (...)` (error) | A refund step needs the operator (the reason in parentheses), but moving the deposit to `recovery_failed` was refused (the reason after the colon), usually because its status changed meanwhile; the keeper re-runs the step every cycle | Check the deposit's status: `refunded` needs nothing (the next cycle closes the recovery); otherwise resolve the refusal, after which the line becomes `REFUND FAILED` |
| `was refunded (order ...) but could not be marked refunded` (error) | Monerium paid the refund out, but the deposit could not be set `refunded`; the keeper retries every cycle | Do not refund again. If it repeats, check the deposit's status and the database, then close it with `PATCH .../deposits/<id>/status {"status": "refunded"}` |
| `float steps wait for the unconfirmed float transfer of deposit` (warn) | That deposit's float transfer has no confirmed receipt, so other clients' float steps wait | Check the transfer's hash and the float's pending nonce; if it was dropped, park the refund, clear its hash (`UPDATE monerium_recoveries SET float_topup_tx_hash = NULL WHERE deposit_id = '<depositId>';`), then set it back to `recovering` (§2.7): a `topping_up` refund without a hash returns to `swapped` and re-derives the top-up from balances, so no hand send is needed |
| `FLOAT ETH EMPTY` (error) / `float ETH running low` (warn) | The float's ETH cannot pay for one transfer / is below 0.05 ETH; every float send (EURe and gas top-ups) fails without it, and a refund whose step keeps failing parks after five attempts | Send ETH to the float wallet named in the line, then set any refund parked meanwhile back to `recovering` (§2.7) |
| `FLOAT UNDERFUNDED` / `FLOAT EMPTY` (error) | The EURe float cannot cover a top-up; the refund waits at `swapped` | Fund the float wallet named in the line; the step retries every cycle |
| `refund of deposit ... in phase ... since` (warn ≥1 h, error ≥4 h) | One client's open refund lingers or is parked (the line names the deposit; one line per open refund) | Check that client's refund wallet's balances and pending transactions, RPC health, Monerium order state; escalate per §2.7 |
| `untrusted factory` / `config violation` / `bytecode is not the EIP-1167 clone` / `not registered on trusted factory` | Should-be-impossible state | Full incident: global pause, verify `MONERIUM_B2B_FORWARDER_FACTORY_ADDRESS`, run the manifest verifier, compare against manifest history |
| `reconciled guardian-authorized fee policy change` | A timelocked fee-policy change applied — expected, DB updated | No incident; confirm it matches the announced change |
| `config violation ... destination changed on chain` | Should be impossible: the clone has no destination setter | Full incident (see the row above) |
| `re-sent never-mined execution ... at reserved nonce` (warn) | A keeper transaction was reserved but never mined (process died before the send, the send threw, or the relay dropped it); after five idle minutes the keeper re-sent the identical call at that nonce | None: the next cycle finalizes it. `consumed its reserved nonce ... with a no-op` means the call reverts (or the account cannot convert: not activated, suspended, dormant or closed): the row fails on the next cycle and retries on a fresh plan; the line can repeat each cycle until the no-op is mined (a private relay can hold it), which is harmless since only one transaction per nonce mines. `re-send of execution ... failed` repeating means the keeper wallet cannot send (gas balance, RPC). A reservation behind a dropped `poke()` converges too: the missing nonces are first filled with no-ops |
| `onboarding advance failed` (repeating for one account) | Link/IBAN automation stuck | Check the `financial_operations` row: `failed` retries itself; `unknown` needs manual reconciliation (compare Monerium-side state, then update the row) |
| `the deployer cannot deploy for profile` (error) | The registration waits as `deployer_not_ready`: the deployer key has no role on the factory or no gas (Vortex's side, not the partner's input) | Grant the role (`setDeployer`, §8.5) or fund the deployer address; the next cycle deploys |
| `deployment ... has no receipt after 10 minutes; sending it again` (warn) | A registration's deployment was dropped or never mined | Nothing, unless it repeats: check the deployer's pending nonce, gas price and the private RPC |
| `delivery ... abandoned after N attempts` | Partner webhook endpoint down > backoff horizon | Contact partner; deliveries are not retried after abandonment — partner should poll `GET /v1/monerium-b2b/deposits` to catch up |
| `MONERIUM_B2B_PRIVATE_RPC_URL is not set` | Keeper writes in the public mempool | Set the private orderflow RPC (operational finding on mainnet) |

## 4. Dormancy gate

Why: CEX rotation risk concentrates in dormant accounts — an exchange silently rotates
a deposit address; months later a deposit arrives and USDC would be forwarded to an
address the client no longer controls. The gate converts that silent loss into a pause.

**Automatic:** an `active` account whose last confirmed conversion (for a never-converted
account, its activation; its creation when none was recorded) is 60 days old is paused
(`setGuardianPaused(true)` with the guardian key, which the backend therefore keeps hot,
ADR-0007 decision 4) and `dormant_since` is recorded; the conversion executor stops
swapping and forwarding for it but still recovers deposits marked for the refund path
(`recover` ignores the pause).
EURe arriving during dormancy accumulates safely; a deposit into a dormant account is
therefore refunded through §2.7 once the window is missed, unless re-confirmation
arrives first.

**Re-confirmation (manual, via partner):** partner re-confirms in writing that the
destination is valid and client-controlled (ADR B5). If the destination changed, deploy
a new clone with the new destination and migrate (§5) — the clone has no setter and
Vortex must never redirect — and re-running the penny test is recommended for CEX
destinations. Archive the
confirmation.

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
2. Let the keeper drain the old clone (forward every open deposit; refund a remainder below the minimum via §2.7).
3. Link the new clone to the same Monerium profile (attestor flow — automated once the
   account row's forwarder is repointed, or manual `POST /addresses`).
4. Move the IBAN: `PATCH /ibans/{iban}` with the new address — this is the
   S1-sensitive operation; it must only ever happen inside an announced migration.
5. Update the `monerium_accounts` row (forwarder address), re-activate (§1.7), then
   optionally penny-test the new clone: only an active account converts.

There is no unlink at Monerium and no custodial parking position: EURe mints to the
IBAN's current default address. The old clone stays linked, so a payer who names it in
the SEPA memo still mints there; that payment is refunded by hand (§2.7, "Memo-routed
payment").

## 6. Key compromise quick reference

| Key | Blast radius | Response |
|---|---|---|
| Attestor | Can link addresses to profiles; never move funds (recovery payouts go only to the client's own bank account) | Rotate key; new forwarders need a new implementation (ATTESTOR is immutable); existing links unaffected |
| Keeper | `poke`/`swap`/`forward`/`recover`: can pick any whitelisted route and any reference inside the Chainlink band — worst case the fee reaches the 1% cap or the vault pays up to its caps, plus gas theft — and can move a payment whose batch is 2 h old to the client's refund wallet (never anywhere else, never a redirect) | Rotate; `setKeeper(old,false)` + `setKeeper(new,true)`; pause the vault while rotating; reconcile executions against Coinbase history; audit `Recovered` events against marked deposits; refund gas |
| Refund seed (`MONERIUM_B2B_REFUND_SEED`) | Derives every client's refund wallet; each holds funds only between that client's `recover` and its bank refund, or after a payer memo-routes a payment to it until it is refunded by hand (§2.7), and can redeem them out of the client's IBAN to any IBAN | Set `MONERIUM_B2B_AUTO_RECOVERY=off`, finish or reconcile open refunds by hand, rotate the seed, then give every client a new clone with its new refund wallet and move the IBANs (§5); the old wallets hold nothing between refunds unless a payment is memo-routed to them later (keep the old seed for that refund) |
| Guardian | Pause/unpause, bounded params, timelocked fee policy, route whitelist (validated), vault limits and withdrawal to treasury, revoking clones — delay-only griefing plus Vortex-money exposure | Two-step `transferGuardian`/`acceptGuardian`; audit pause, pending-policy, route, vault, keeper and deployer state after (below) |
| Deployer (`MONERIUM_B2B_DEPLOYER_PRIVATE_KEY`) | Deploys a registered clone for any destination and refund address; no power over existing clones, funds or settings. Each such clone counts as a forwarder, so the vault pays it, up to its `dailyBudget` and `maxSubsidyPpm`, once its batch delay allows a swap | Guardian: `setDeployer(old,false)`, then `revokeForwarder` for its rogue clones (below); fresh key, fund it, `setDeployer(new,true)`, update the env |
| Whitelabel API credentials | Control-plane: can re-link/move IBANs (future mints only) — S1 | §2.5 full sequence |
| `ADMIN_SECRET` | Map/suspend accounts (mapping is bounded by on-chain clone verification) | Rotate; audit recent admin mutations |
| Webhook HMAC secret | Fabricated inbound order events (accounting noise; forward-only lattice + mint watcher bound the damage) | Rotate at both ends; reconcile deposits against chain |

**Leaked deployer key (guardian key).** The factory registry is what the vault and the
backend's account mapping trust, so a rogue clone is cleaned out of it:

1. Stop new deployments: `cast send $FACTORY "setDeployer(address,bool)" $OLD false
   --rpc-url $RPC --private-key $GUARDIAN_KEY`. Clones it already deployed stay
   registered.
2. Optionally pause the vault (`setPaused(true)`, §2.1) while you work: below-floor swaps
   defer meanwhile.
3. Enumerate the clones the key deployed: the manifest generator (§1.3) lists the
   factory's `ForwarderDeployed` events with their deploy transactions, and
   `cast tx <hash> from` names the sender. Drop every clone that backs an account
   (`GET /v1/admin/monerium-b2b/accounts`, `forwarderAddress`) or a registration
   (`GET /v1/admin/monerium-b2b/registrations`, `deployTxHash`); the rest are rogue.
4. Revoke each rogue clone: `cast send $FACTORY "revokeForwarder(address)" <clone>
   --rpc-url $RPC --private-key $GUARDIAN_KEY` (one-way, emits `ForwarderRevoked`; the
   vault then refuses it, so its swaps that need a subsidy revert, and the backend refuses
   to map it; a clone that holds funds keeps its forward and recover paths). Never revoke a clone that backs a live account: its subsidies stop and
   the monitor raises `not registered on trusted factory` (§3).
5. Generate a fresh deployer key, fund it, grant it, set it in
   `MONERIUM_B2B_DEPLOYER_PRIVATE_KEY`, restart, then unpause the vault.

**After a guardian transfer.** Keepers and deployers survive `acceptGuardian`, so the new
guardian inherits them. Read the factory's `KeeperSet` and `DeployerSet` events, check
`isKeeper(address)` and `isDeployer(address)` for every address that ever appeared, and
reset what is not recognised with `setKeeper(address,false)` and
`setDeployer(address,false)`.

## 7. Local mainnet-fork integration exercise

This exercise validates the deployed forwarder and live keeper backend together against
real Ethereum mainnet token, pool, router, and oracle state. It is an opt-in operator
exercise, not a hermetic automated test: it needs an archive-capable Ethereum RPC, a
local Postgres database, and the API environment. It must not run in the PR-blocking test
suite; `operations-testing.md` deliberately keeps fork tests out of CI.

The procedure below is the cleaned-up path from a successful reference run. It assumes
archive access and a historical EURe holder are available from the outset. Use only the
standard public Anvil development keys for the local roles.

### 7.1 Reference configuration and result

| Item | Reference value |
|---|---|
| Fork block | `25876292` |
| Chain ID | `1` |
| Anvil RPC | `http://127.0.0.1:8545` |
| Archive proxy | `http://127.0.0.1:9545` |
| EURe V2 | `0x39b8B6385416f4cA36a20319F70D28621895279D` |
| EURC | `0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c` |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| SwapRouter02 | `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` |
| Chainlink EUR/USD | `0xb49f677943BC038e9857d61E7d053CaA2C1734C1` |
| EURe holder | `0x0cC2CaeD31490B546c741BD93dbba8Ab387f7F2c` |
| Factory | `0xbe613aa10f731ea38786a082a341fe1a1bc9e266` |
| Factory deployment tx | `0xf3531fbdb27ed9303974b282ed2df4c53765c0910e210c7cba182e6c7f25a368` |
| Forwarder | `0xe06103c9E374a1CD78f17417d1eA3AE4eBaC7CFD` |
| Forwarder deployment tx | `0x7d4f667d4de9b7a5d5aced2203a3f11dcd0b477e5d405d5b8a2317f2b56b7c4c` |
| Destination | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` |
| Recovery wallet | (reference run predates the recovery wallet; use any local EOA) |
| Local account id | `5ebca15c-dadf-4eeb-aabb-e9c7462ff6b3` |
| Mock Monerium profile id | `f436dbeb-6012-4688-ab3b-d2446980c835` |
| Managed profile id | `c419d077-3e2b-488a-b228-359311c63324` |
| Mock IBAN | `DE12500105170648489890` |

The reference deposit transferred 25 EURe to the forwarder in transaction
`0x727a53eb525e5851d8db38ea99c2f39633b6213de5757639d82e6c112e49079a`.
The live keeper confirmed conversion transaction
`0xb52f38073c41b5e8d2f89deab5c2b8536362acfd97903579113630fc02b58eb4`,
consumed the full 25 EURe, and forwarded `29.012924` USDC with a zero fee. That run
predates the reference-priced fee bands; a new run records a reference, a route, and a
fee or subsidy per the bands instead of a flat zero fee. These addresses and hashes are
evidence from that ephemeral run, not deployment pins; use the receipts and addresses
produced by each new run.

### 7.2 Start an archive-backed fork

To avoid placing `ALCHEMY_API_KEY` in Anvil's process arguments, run a local proxy from
`apps/api/` that reads the existing `.env`:

```bash
bun -e '
import "dotenv/config";
const upstream = `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
Bun.serve({
  hostname: "127.0.0.1",
  port: 9545,
  async fetch(request) {
    return fetch(upstream, {
      method: request.method,
      headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
      body: request.body
    });
  }
});
await new Promise(() => {});
'
```

In another terminal, start the fixed fork:

```bash
anvil \
  --fork-url http://127.0.0.1:9545 \
  --fork-block-number 25876292 \
  --chain-id 1 \
  --host 127.0.0.1 \
  --port 8545 \
  --no-rate-limit
```

Confirm the fork can read historical state before deploying anything:

```bash
cast call 0x39b8B6385416f4cA36a20319F70D28621895279D \
  "balanceOf(address)(uint256)" \
  0x0cC2CaeD31490B546c741BD93dbba8Ab387f7F2c \
  --rpc-url http://127.0.0.1:8545
```

At the reference block the holder had `191297573010983027041550` raw EURe units.
Fund its native balance locally and impersonate it; do not mutate its EURe storage:

```bash
cast rpc anvil_setBalance \
  0x0cC2CaeD31490B546c741BD93dbba8Ab387f7F2c \
  0x8AC7230489E80000 \
  --rpc-url http://127.0.0.1:8545

cast rpc anvil_impersonateAccount \
  0x0cC2CaeD31490B546c741BD93dbba8Ab387f7F2c \
  --rpc-url http://127.0.0.1:8545
```

Before deploying the forwarder, send 5 EURe to an unrelated address and verify its
balance. This isolates basic fork/provider/ERC-20 failures from forwarder failures:

```bash
cast send 0x39b8B6385416f4cA36a20319F70D28621895279D \
  "transfer(address,uint256)(bool)" \
  0x1234567890123456789012345678901234567890 \
  5000000000000000000 \
  --from 0x0cC2CaeD31490B546c741BD93dbba8Ab387f7F2c \
  --unlocked \
  --rpc-url http://127.0.0.1:8545
```

### 7.3 Deploy the factory and clone

Build from `contracts/monerium-forwarder/` and deploy
`VortexForwarderFactory.sol:VortexForwarderFactory` with three distinct standard Anvil
accounts: account 0 as guardian, account 1 as keeper, and account 2 as attestor. Use
account 3 as the fee recipient. Anvil prints these public development keys and addresses
on startup.

Use the ADR's canonical constructor values, not the older values that may appear in test
fixtures:

| Constructor field | Value |
|---|---:|
| `MAX_ORACLE_AGE` | 52 hours |
| `SLIPPAGE_BPS` | 60 (on the client's net after fee and subsidy) |
| `MAX_FEE_PPM` | 10000 |
| `MAX_REFERENCE_DEVIATION_BPS` | 100 |
| `RECOVERY_DELAY` | 2 hours |
| `TRIGGER_DELAY` | 24 hours |
| Initial route | EURe → EURC → USDC, 500 / 500 (packed path constructor argument) |
| `RECOVERY_HASH` | `bytes32(0)` |
| `MIN_SWAP_FLOOR` | `1e18` |
| `CAP_CEILING` | `50000e18` |
| Initial `minSwapAmount` | `1e18` |
| Initial `perSwapCap` | `10000e18` |

After deployment, register Anvil account 1 as a keeper:

```bash
cast send "$FACTORY" "setKeeper(address,bool)" "$KEEPER" true \
  --private-key "$GUARDIAN_KEY" --rpc-url http://127.0.0.1:8545
```

Deploy `VortexSubsidyVault` (USDC, account 3 as treasury, the factory, 5000 ppm, 200e6)
and point the factory at it with `setSubsidyVault`. Fund it with USDC from an
impersonated mainnet holder if you want to exercise a below-floor top-up; left empty,
a below-floor fill makes the keeper defer, which is also a valid outcome to observe.

Deploy a client clone with the default policy (1250 / 1500) as in §1.2, passing the
refund address the backend derives for the fixture's Monerium profile ID (the account
mapping verifies it). Use a fresh salt and record the predicted address and receipt.
Read back `destination()`, `recoveryAddress()`,
`targetPpm()`, `floorPpm()`, and `FACTORY()`, then require
`factory.isForwarder(forwarder) == true` before continuing. The keeper computes its
reference from the live Coinbase ticker before each swap, so the backend needs outbound
HTTPS during the run.

### 7.4 Create the local account fixture

This exercise does not create a real Monerium corporate. Generate a random UUID for
`moneriumProfileId`, then call the normal admin mapping endpoint with an existing active
managed-profile manager:

```json
{
  "managerProfileId": "<active-manager-profile-uuid>",
  "externalSubjectId": "local-corporate-<random-uuid>",
  "contactEmail": "local-corporate-<random-uuid>@example.com",
  "moneriumProfileId": "<random-uuid>",
  "forwarderAddress": "<deployed-clone>",
  "destination": "<destination>",
  "targetPpm": 1250,
  "floorPpm": 1500
}
```

Send it to `POST /v1/admin/monerium-b2b/accounts` with
`Authorization: Bearer $ADMIN_SECRET`. This exercises the real forwarder registration
and config verification before creating the managed child, approved KYB mirror, and
`onboarding` account.

Because the Monerium profile is intentionally fake, mock an IBAN directly on the new
local `monerium_accounts` row. Then activate through the real endpoint rather than
updating status directly:

```http
PATCH /v1/admin/monerium-b2b/accounts/<account-id>/status
Authorization: Bearer <ADMIN_SECRET>
Content-Type: application/json

{ "status": "active" }
```

The activation response must report `accountStatus: "active"`. The direct IBAN update
is a local fixture seam only; never use it outside an ephemeral local database.

### 7.5 Start the keeper backend

The Monerium B2B worker is owned by the `mykobo` flow variant. A default `monerium`
backend serves the API but deliberately does not start this worker. The simplest
reproduction is one `mykobo` backend that serves both the admin API and keeper:

```bash
FLOW_VARIANT=mykobo \
PORT=3000 \
MONERIUM_B2B_RPC_URL=http://127.0.0.1:8545 \
MONERIUM_B2B_PRIVATE_RPC_URL=http://127.0.0.1:8545 \
MONERIUM_B2B_GUARDIAN_PRIVATE_KEY="$ANVIL_ACCOUNT_0_KEY" \
MONERIUM_B2B_KEEPER_PRIVATE_KEY="$ANVIL_ACCOUNT_1_KEY" \
MONERIUM_B2B_ATTESTOR_PRIVATE_KEY="$ANVIL_ACCOUNT_2_KEY" \
bun run --cwd apps/api dev
```

The log must contain `Starting Monerium B2B keeper worker`. Before this first start,
verify every mapped forwarder has zero EURe balance. Then wait for one worker cycle and
verify `monerium_chain_cursors` contains `eure-mints:1` before sending the deposit;
otherwise the watcher's first-run bootstrap intentionally starts at the current settled
head and treats earlier chain history and balances as out of scope.

### 7.6 Send and settle the deposit

Transfer exactly 25 EURe from the impersonated holder to the clone:

```bash
cast send 0x39b8B6385416f4cA36a20319F70D28621895279D \
  "transfer(address,uint256)(bool)" \
  "$FORWARDER" \
  25000000000000000000 \
  --from 0x0cC2CaeD31490B546c741BD93dbba8Ab387f7F2c \
  --unlocked \
  --rpc-url http://127.0.0.1:8545
```

Mine 13 blocks so the transfer is beyond the watcher's 12-block reorg safety depth:

```bash
cast rpc anvil_mine 0xd --rpc-url http://127.0.0.1:8545
```

Wait for the next worker cycle. A direct transfer has no matching Monerium order, so the
expected path is deliberately `unattr:` rather than an attributed customer deposit — and
since 2026-09-17 the keeper never converts `unattr:` rows, so to exercise a conversion
insert the matching order row by hand (or send the mint through the sandbox webhook)
before the watcher records it; the log should then show the mint, one `swap` execution
and one `forward` execution.

Verify the durable records:

```sql
SELECT monerium_order_id, amount_raw, status, tx_hash, log_index, block_number
FROM monerium_fiat_deposits
WHERE account_id = '<account-id>';

SELECT kind, deposit_id, eure_in_raw, usdc_gross_raw, fee_raw, subsidy_raw, usdc_net_raw, destination,
       reference_rate_raw, reference_source, max_subsidy_raw, route_index,
       tx_hash, nonce, broadcast_block_number, block_number, swap_log_index, status, error
FROM monerium_conversion_executions
WHERE account_id = '<account-id>' ORDER BY created_at;
```

Required results:

- One `forwarded` deposit with the real transfer hash and log index.
- One `confirmed` `swap` execution bound to it with the 25 EURe input, a recorded
  reference (rate, source), the tier cap and route index 0, a fee or subsidy
  consistent with the fill's position against the reference bands (`usdc_net_raw =
  usdc_gross_raw - fee_raw + subsidy_raw`), non-null nonce/hash/block/swap-log-index,
  destination matching the clone, and `error IS NULL`. If the vault was left empty and
  the fill sat below the floor, expect a `deferring conversion` log line and no
  execution row instead.
- One `confirmed` `forward` execution bound to the same deposit whose `usdc_net_raw`
  equals the swap's net.
- The forwarder's EURe and USDC balances are zero.
- The destination's USDC balance increased by the forward's `usdc_net_raw` in one transfer.
- The swap receipt contains `SwapExecuted` from the clone and no transfer to the
  destination; the forward receipt contains `Forwarded` and the USDC `Transfer` from the
  clone to the configured destination.

### 7.7 What this exercise validates

- An archive-backed mainnet fork can execute the real EURe V2 proxy and emit the
  canonical `Transfer` event consumed by the watcher.
- Factory construction deploys the implementation with the canonical parameter values,
  registers the keeper, and creates an initialized EIP-1167 clone.
- Successful admin provisioning reads back the clone's factory registration and config
  before creating the managed child plus approved KYB mirror.
- The account activation success path works once an IBAN is present.
- Only the `mykobo` backend owns and starts the B2B keeper worker.
- The persisted chain cursor detects the transfer after it is moved beyond the 12-block
  safety depth.
- A direct transfer to a known forwarder is durably recorded as an unattributed mint,
  not silently presented as a Monerium customer order.
- The executor's durable path leaves a confirmed `swap` execution bound to the deposit
  with its nonce, transaction hash, block number, log index, amounts and destination
  recorded, followed by a confirmed `forward` execution for the summed net.
- The real contract accepts the current Chainlink EUR/USD answer, the keeper's live
  Coinbase reference inside the band, and swaps successfully through whitelisted route 0
  (EURe -> EURC -> USDC on the 5-bps tiers).
- Keeper authorization, the 25 EURe minimum, allowance reset, full EURe consumption,
  fee-band accounting against the recorded reference, USDC accumulating on the clone,
  and one forward to the immutable per-client destination work together.

### 7.8 What this exercise does not validate

- It does not make a SEPA transfer or ask Monerium to mint EURe. The input is an ordinary
  ERC-20 transfer from an impersonated historical holder.
- It does not create or approve a corporate in Monerium, link the forwarder through the
  attestor/EIP-1271 flow, request an IBAN, or process a real `iban.updated` webhook. The
  Monerium profile UUID and IBAN are local fixtures.
- It does not test webhook HMAC verification, durable inbox deduplication, Monerium order
  state transitions, amount/hash matching, or the attributed-deposit path. The tested
  mint is intentionally unattributed.
- It does not prove that a bank or CEX credits the destination. It proves only the
  on-chain USDC balance increase.
- It does not test invalid admin authentication or the activation rejection before an
  IBAN is present. It also does not exercise provisioning rejection for an unregistered
  or misconfigured forwarder; only authenticated successful provisioning and activation
  run.
- It does not test out-of-bounds factory parameters or prove their rejection; the run
  deploys only the canonical valid parameter set.
- It does not test fee-policy timelocks, route selection among several routes, a funded
  vault's top-up (unless you fund it), the reference band rejection, per-swap-cap
  chunking of one deposit, sub-minimum remainders, pause controls, dormancy,
  permissionless triggering, or the recovery path (§2.7).
- It does not test stale/invalid oracle answers, insufficient liquidity, excess price
  impact, slippage reverts, router failure, token transfer failure, or depeg behavior.
- It does not test reorg replacement, duplicate-log replay, concurrent executors,
  advisory-lock contention, process crashes before/after broadcast, lost transaction
  hashes, nonce replacement, or restart recovery.
- It does not test production key custody, private orderflow, production RPC behavior,
  source verification, deployment manifests, or independent bytecode verification.
- It does not validate manager notifications, webhook outbox delivery, email delivery,
  or the 32-block client-notification confirmation policy.
- It does not constitute a clean monitoring pass. In the reference run the association
  monitor received the expected provider `403` for the fake profile, and the large-size
  executable-depth quote timed out once; neither monitor was part of the conversion
  success criterion.

## 8. Sepolia sandbox bring-up

Monerium's sandbox mints EURe on Ethereum Sepolia, and `api-sandbox.vortexfinance.co`
(the `vortex-sandbox` Render service, deployed from `main`) runs the keeper for it.
This section is the Sepolia counterpart of the mainnet deploy checklist in the rollout
doc. Every command below was dry-run on a local fork of Sepolia on 2026-10-06: pool,
factory, vault and clone, a payment converted in two chunks and forwarded, and the
refund leg (recover after the window, reverse swap). Set the B2B variables on the
`vortex-sandbox` service only, never in the shared "Vortex API" env group, which
production and staging both read; production stays dark.

### 8.1 Sepolia addresses (verified on chain 2026-10-06)

| Contract | Address |
|---|---|
| EURe (Monerium sandbox) | `0x67b34b93ac295c985e856E5B8A20D83026b580Eb` |
| EURC (Circle) | `0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4` |
| USDC (Circle) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Chainlink EUR/USD (8 decimals) | `0x1a81afB8146aeFfCFc5E50e8479e826E7D55b910` |
| Uniswap v3 factory | `0x0227628f3F023bb0B980b67D528571c95c6DaC1c` |
| Uniswap SwapRouter02 | `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E` |
| Uniswap NonfungiblePositionManager | `0x1238536071E1c677A632429e3655c799b22cDA52` |
| Mispriced EURe/USDC 5 bps pool (never whitelist) | `0xaC4D4fe930cb78b6eAC08e8Ec3cCA5Ea12059aD2` |

The July 2026 link-test deployment (factory `0xcBE354…`) used other tokens and a
placeholder router; it is not reusable.

The sandbox deployment of 2026-10-07 (§8.4 and §8.5, from the PR #1408 code with the
bound CREATE2 salt and `revokeForwarder`):

| Contract | Address |
|---|---|
| Factory (guardian `0x44fd1d3b38A4523F6F5309ea5a5F8d7b4Df82a7f`) | `0xebbE4f26e856c138D34086Aa1CEB468d20c79992` |
| Forwarder implementation (`RECOVERY_DELAY` 900) | `0x0cFc619C62f9Cf0778D3269345cd6Ca2AF39BE1C` |
| Subsidy vault | `0x155f59523E24ef4046756A83a58B972e31d4ec4a` |
| EURe/USDC 1 bps pool, factory route 0 | `0xFAB9CFfbA5Fc6fB32c7121128C58716D460a5579` |

An earlier factory of the same day (`0x1E87a5…3891`, vault `0xE7C9Da…B95c`, emptied back
to the treasury) predates the salt binding and the revoke; it has no clones and is not
used.

### 8.2 What differs from mainnet

- **Vortex runs the pool.** The only EURe/USDC pool with liquidity prices EURe at 0.71
  USDC (Chainlink: 1.127 on 2026-10-06), so a swap there misses the floor (Chainlink
  − `SLIPPAGE_BPS`) and reverts, and every payment would end in a refund. Vortex seeds
  its own 1 bps pool at the Chainlink price (§8.4).
- **No quoting.** Off mainnet the keeper does not quote routes; it swaps on the first
  enabled factory route. Make the 1 bps pool the initial route and add no other.
- **No arbitrage.** Nothing pulls the pool back to the market, and each conversion moves
  it a little. Re-centre it before every test session (§8.9). The mispriced 5 bps pool
  is an open arbitrage against it: if its USDC disappears between sessions, re-seed.
- **Fresh keys only.** The well-known development keys (anvil's) carry delegated code on
  Sepolia that sweeps any ETH sent to them.
- **No private orderflow.** `MONERIUM_B2B_PRIVATE_RPC_URL` is required only when
  `DEPLOYMENT_ENV=production`.
- **Public RPCs lag.** A load-balanced endpoint such as publicnode can answer a balance
  or nonce from a node a block behind; when a send fails with `nonce too low`, resend
  with `--nonce`.

### 8.3 Keys and funding

- Fresh EOAs: guardian, keeper, attestor and deployer (four distinct keys), the float wallet
  (`MONERIUM_B2B_FLOAT_PRIVATE_KEY`, also distinct from the deployer: both send with
  implicit nonces), and a fee recipient address Vortex controls.
  `MONERIUM_B2B_REFUND_SEED` is any fresh 32-byte secret (`openssl rand -hex 32`). The
  first block below writes them, the webhook secret and a test destination to a private
  file outside every checkout, under the backend's variable names, and prints only the
  addresses.
- Sepolia ETH: about 0.2 each for the guardian (factory and vault deployment), the
  deployer (one clone per registered client), the keeper (swaps, forwards, recoveries)
  and the float (it tops up the refund wallets' gas).
- Sandbox EURe for the guardian (pool seeding) and the float (refund top-ups): link the
  address to a Vortex profile in Monerium's sandbox and use "Simulate bank transfer" on
  that profile's IBAN. Sandbox EURe costs nothing.
- USDC: buy it with sandbox EURe from the mispriced 5 bps pool; its price is irrelevant
  when the EURe is free. 2,000 EURe bought about 1,385 USDC in the dry run.

```bash
F=~/.vortex/monerium-b2b-sepolia.env   # never commit it or paste it anywhere
[ -e "$F" ] || (umask 077; mkdir -p ~/.vortex
  for ROLE in GUARDIAN KEEPER ATTESTOR DEPLOYER FLOAT FEE_RECIPIENT E2E_DESTINATION; do
    W=$(cast wallet new --json)
    case $ROLE in FEE_RECIPIENT|E2E_DESTINATION) VAR=${ROLE}_PRIVATE_KEY ;; *) VAR=MONERIUM_B2B_${ROLE}_PRIVATE_KEY ;; esac
    echo "$VAR=$(jq -r '.[0].private_key' <<< "$W")" >> "$F"; echo "$ROLE=$(jq -r '.[0].address' <<< "$W")" >> "$F"
  done
  echo "MONERIUM_B2B_REFUND_SEED=0x$(openssl rand -hex 32)" >> "$F"
  echo "MONERIUM_B2B_WEBHOOK_SECRET=whsec_$(openssl rand -base64 32)" >> "$F")
grep -E '^[A-Z_0-9]+=0x[0-9a-fA-F]{40}$' "$F"   # the addresses
set -a; . "$F"; set +a; GUARDIAN_KEY=$MONERIUM_B2B_GUARDIAN_PRIVATE_KEY
```

```bash
RPC=<Sepolia RPC URL>
EURE=0x67b34b93ac295c985e856E5B8A20D83026b580Eb
EURC=0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4
USDC=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
ORACLE=0x1a81afB8146aeFfCFc5E50e8479e826E7D55b910
ROUTER=0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E
NPM=0x1238536071E1c677A632429e3655c799b22cDA52
UNI_FACTORY=0x0227628f3F023bb0B980b67D528571c95c6DaC1c
GUARDIAN=$(cast wallet address $GUARDIAN_KEY)

cast send $EURE "approve(address,uint256)" $ROUTER 2000ether --rpc-url $RPC --private-key $GUARDIAN_KEY
cast send $ROUTER "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))" \
  "($EURE,$USDC,500,$GUARDIAN,2000000000000000000000,0,0)" --rpc-url $RPC --private-key $GUARDIAN_KEY
```

### 8.4 Seed the 1 bps pool

Seed it at the higher of the Chainlink answer and the keeper's reference, the Coinbase
EURC-USDC midpoint: a fill below the reference less the client's floor waits for the
subsidy ladder, and one below Chainlink less `SLIPPAGE_BPS` reverts. On 2026-10-07
Sepolia's Chainlink answer was 20 bps above the reference.

USDC sorts before EURe, so the pool's price is EURe base units per USDC base unit,
`1e20 / price` for a price with 8 decimals. The position spans ±1% (100 ticks at the
1 bps tier's spacing of 1). 1,000 USDC and about 900 EURe keep a €100 payment's price
impact around 0.1%.

```bash
ANSWER=$(cast call $ORACLE "latestRoundData()(uint80,int256,uint256,uint256,uint80)" --rpc-url $RPC | sed -n 2p | awk '{print $1}')
REF=$(curl -s https://api.exchange.coinbase.com/products/EURC-USDC/ticker | jq -r '((.bid|tonumber)+(.ask|tonumber))/2*1e8|floor')
PRICE=$(( ANSWER > REF ? ANSWER : REF ))
read SQRT_PRICE TICK_LOWER TICK_UPPER < <(python3 -c "
import math; a=$PRICE
tick = math.floor(math.log(10**20 / a, 1.0001))
print(math.isqrt(10**20 * 2**192 // a), tick - 100, tick + 100)")

cast send $NPM "createAndInitializePoolIfNecessary(address,address,uint24,uint160)" $USDC $EURE 100 $SQRT_PRICE \
  --rpc-url $RPC --private-key $GUARDIAN_KEY
POOL=$(cast call $UNI_FACTORY "getPool(address,address,uint24)(address)" $USDC $EURE 100 --rpc-url $RPC)
cast send $USDC "approve(address,uint256)" $NPM 1000000000 --rpc-url $RPC --private-key $GUARDIAN_KEY
cast send $EURE "approve(address,uint256)" $NPM 1000ether --rpc-url $RPC --private-key $GUARDIAN_KEY
# pass a limit: the mint used 2.43M gas on Sepolia, and 1.5M ran out
cast send $NPM "mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))" \
  "($USDC,$EURE,100,$TICK_LOWER,$TICK_UPPER,1000000000,1000000000000000000000,0,0,$GUARDIAN,$(( $(date +%s) + 3600 )))" \
  --gas-limit 4000000 --rpc-url $RPC --private-key $GUARDIAN_KEY
cast call $USDC "balanceOf(address)(uint256)" $POOL --rpc-url $RPC   # 1000000000
```

### 8.5 Deploy the factory, register the keeper, deploy the vault

The parameters are the ADR's (§7.3 table) except `perSwapCap`: €25 lets a €60 test
payment convert in three chunks. It is operational; `setPerSwapCap` changes it later.
`RECOVERY_DELAY` is 15 minutes instead of two hours, so a refund test fits into one
session; it is immutable, and `MONERIUM_B2B_RECOVERY_DEADLINE_MINUTES` (§8.6) matches it.
The subsidy ladder's top tier, from 16 minutes, then never applies. The initial route is
the 1 bps pool, EURe → USDC.

From `contracts/monerium-forwarder/`, with `ATTESTOR`, `KEEPER`, `DEPLOYER` and
`FEE_RECIPIENT` set to the §8.3 addresses, and `FACTORY` and `VAULT` taken from forge's "Deployed to" line:

```bash
ROUTE=$(cast concat-hex $EURE 0x000064 $USDC)   # fee 100 as three bytes
forge create src/VortexForwarderFactory.sol:VortexForwarderFactory --rpc-url $RPC --private-key $GUARDIAN_KEY --broadcast \
  --constructor-args "($EURE,$EURC,$USDC,$ROUTER,$ORACLE,$ATTESTOR,$FEE_RECIPIENT,187200,60,10000,100,900,86400,0x0000000000000000000000000000000000000000000000000000000000000000)" \
  1000000000000000000 50000000000000000000000 1000000000000000000 25000000000000000000 $ROUTE
cast call $FACTORY "route(uint256)(bytes,bool)" 0 --rpc-url $RPC   # the path above, true
cast send $FACTORY "setKeeper(address,bool)" $KEEPER true --rpc-url $RPC --private-key $GUARDIAN_KEY
# the partner registration path deploys clones with its own deployer key
cast send $FACTORY "setDeployer(address,bool)" $DEPLOYER true --rpc-url $RPC --private-key $GUARDIAN_KEY

# vault: 1% per swap (the ladder's top), 50 USDC per day
forge create src/VortexSubsidyVault.sol:VortexSubsidyVault --rpc-url $RPC --private-key $GUARDIAN_KEY --broadcast \
  --constructor-args $USDC $FEE_RECIPIENT $FACTORY 10000 50000000
cast send $FACTORY "setSubsidyVault(address)" $VAULT --rpc-url $RPC --private-key $GUARDIAN_KEY
cast send $USDC "transfer(address,uint256)" $VAULT 20000000 --rpc-url $RPC --private-key $GUARDIAN_KEY
```

Then generate and verify the manifest as in §1.3. Sepolia's public RPCs prune old logs,
so pass `--logs-rpc` with an endpoint that serves the full history, and commit the
result to `manifests/`.

### 8.6 Sandbox backend configuration

On the `vortex-sandbox` service only:

| Variable | Value |
|---|---|
| `FLOW_VARIANT` | `mykobo` (startup refuses B2B otherwise; the sandbox's retail EUR onramp then runs on Mykobo) |
| `MONERIUM_WHITELABEL_CLIENT_ID`, `MONERIUM_WHITELABEL_CLIENT_SECRET` | The partner's sandbox white-label app |
| `MONERIUM_B2B_RPC_URL` | Sepolia RPC |
| `MONERIUM_B2B_FORWARDER_FACTORY_ADDRESS` | `$FACTORY` |
| `MONERIUM_B2B_KEEPER_PRIVATE_KEY`, `MONERIUM_B2B_GUARDIAN_PRIVATE_KEY`, `MONERIUM_B2B_ATTESTOR_PRIVATE_KEY` | the three keys of §8.3 |
| `MONERIUM_B2B_REFUND_SEED`, `MONERIUM_B2B_FLOAT_PRIVATE_KEY` | §8.3 |
| `MONERIUM_B2B_DEPLOYER_PRIVATE_KEY` | the deployer key of §8.3 (granted with `setDeployer`) |
| `MONERIUM_B2B_PARTNER_MANAGER_PROFILE_ID` | The partner's manager profile ID on the sandbox: the only key that may register destinations |
| `MONERIUM_B2B_AUTO_RECOVERY` | `auto`, so the refund test runs end to end |
| `MONERIUM_B2B_RECOVERY_DEADLINE_MINUTES` | `15`, the factory's `RECOVERY_DELAY` (§8.5) |
| `MONERIUM_B2B_WEBHOOK_SECRET` | `whsec_` plus base64 of 32 random bytes: `echo "whsec_$(openssl rand -base64 32)"` |
| `MONERIUM_B2B_ENABLED` | `true`, set last |

Restart the service. Startup fails if a required setting is missing; once it is up,
`GET /v1/monerium-b2b/accounts` answers 401 without a key instead of 404.

Only then register Vortex's webhook subscription on the partner's sandbox app with the
same secret: Monerium pings the URL when the subscription is created and does not create
it if the ping fails, and the route exists only while B2B is enabled. Run it from
`apps/api` with that app's credentials and `MONERIUM_API_URL` pointing at Monerium's
sandbox API:

```bash
SECRET=<MONERIUM_B2B_WEBHOOK_SECRET> MONERIUM_WHITELABEL_CLIENT_ID=... MONERIUM_WHITELABEL_CLIENT_SECRET=... \
MONERIUM_API_URL=https://api.monerium.dev bun -e '
import { MoneriumApiService } from "@vortexfi/shared";
console.log(await MoneriumApiService.getInstance().createWebhook({
  secret: process.env.SECRET, types: ["iban.updated", "order.created", "order.updated", "profile.updated"],
  url: "https://api-sandbox.vortexfinance.co/v1/monerium-b2b/webhook" }));'
```

### 8.7 Partner and test clients

1. Make the partner's sandbox profile a manager:
   `PUT /v1/admin/managed-profile-managers/<profileId>` with corridor `EU` and customer
   type `business`. The partner then takes a key from dashboard-sandbox and registers
   its webhook through `POST /v1/webhook` (`DEPOSIT_UPDATED`, `ACCOUNT_UPDATED`).
2. Per test client, the partner registers the Monerium profile ID and a Sepolia
   destination with `POST /v1/monerium-b2b/accounts`. The keeper deploys, maps, links and
   requests the IBAN once Monerium approves the profile, and the account activates when
   the IBAN is recorded: only a backend with `SANDBOX_ENABLED=true` (which boot pairs with
   `DEPLOYMENT_ENV=sandbox`) activates by itself, every other environment needs the §1.7
   call. The manual path (§1.2 to §1.7) remains for a client registered outside the API.

### 8.8 Test payments

Each test runs through one command, with the §8.3 file (plus `MONERIUM_B2B_RPC_URL` and
`MONERIUM_B2B_FORWARDER_FACTORY_ADDRESS` once §8.5 has run) and the partner's secret key:

```bash
VORTEX_SECRET_KEY=sk_test_... bun --env-file="$F" run --cwd apps/api monerium-b2b:sandbox-e2e \
  --profile <moneriumProfileId> [--amount 60] [--refund]
```

It registers the destination (or resumes the registration), waits until the account is
active, checks the clone on chain, asks for the payment, and then checks the outcome: one
forward transaction paying the deposit's net USDC to the destination, or the refund.
`--refund` suspends the account for the payment and reactivates it afterwards, with
`ADMIN_SECRET`. The script does not make the payment. How a payment reaches a
white-label profile's IBAN in the sandbox is still open (rollout ledger): the dashboard's
"Simulate bank transfer" mints only for your own profile, and EURe sent to the clone on
chain is recorded as unattributed and never converted.

| Test | Payment | Expected |
|---|---|---|
| Normal | €20 | One chunk, one forward. The destination receives the reference less the client's target (12.5 bps); the fee treasury the surplus over it |
| Chunked | €60 | Three chunks at the €25 cap, then one forward of their sum |
| Refund | €15 | Suspend the account before the payment (`PATCH /v1/admin/monerium-b2b/accounts/<accountId>/status` with `suspended`): the keeper converts nothing for a suspended account but still arms the clone's clock and runs recoveries. After the deadline (`MONERIUM_B2B_RECOVERY_DEADLINE_MINUTES`, 15 minutes in the sandbox) the deadline job marks the deposit, the keeper recovers it, and the refund leaves from the client's IBAN. Reactivate afterwards. If the simulated transfer carries no payer IBAN and name, the refund parks as `recovery_failed`; that is a finding about the sandbox simulation. Never close it while the refund wallet still holds the EURe: refund it by hand (§2.7) or sweep the EURe back to the float, then `PATCH /v1/admin/monerium-b2b/deposits/<depositId>/status` with `{"status": "refunded"}` (it sends `DEPOSIT_RETURNED`; note a sweep in the ops ledger) |

`DEPOSIT_UPDATED` reports every step to the partner, and `GET /v1/monerium-b2b/deposits`
shows the same snapshots.

### 8.9 Re-centre the pool before a session

Each conversion sells EURe into the pool and pushes its price down, and the reference and
Chainlink move on their own. A swap with a price limit moves the pool back to the higher
of the two (§8.4):

```bash
ANSWER=$(cast call $ORACLE "latestRoundData()(uint80,int256,uint256,uint256,uint80)" --rpc-url $RPC | sed -n 2p | awk '{print $1}')
REF=$(curl -s https://api.exchange.coinbase.com/products/EURC-USDC/ticker | jq -r '((.bid|tonumber)+(.ask|tonumber))/2*1e8|floor')
PRICE=$(( ANSWER > REF ? ANSWER : REF ))
TARGET=$(python3 -c "import math; print(math.isqrt(10**20 * 2**192 // $PRICE))")
CURRENT=$(cast call $POOL "slot0()(uint160,int24,uint16,uint16,uint16,uint8,bool)" --rpc-url $RPC | head -1 | awk '{print $1}')
if python3 -c "import sys; sys.exit(0 if $CURRENT > $TARGET else 1)"; then
  # EURe cheaper than the target: buy EURe with USDC up to it
  cast send $USDC "approve(address,uint256)" $ROUTER 1000000000 --rpc-url $RPC --private-key $GUARDIAN_KEY
  cast send $ROUTER "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))" \
    "($USDC,$EURE,100,$GUARDIAN,1000000000,0,$TARGET)" --gas-limit 600000 --rpc-url $RPC --private-key $GUARDIAN_KEY
else
  # EURe dearer than the target: sell EURe for USDC down to it
  cast send $EURE "approve(address,uint256)" $ROUTER 1000ether --rpc-url $RPC --private-key $GUARDIAN_KEY
  cast send $ROUTER "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))" \
    "($EURE,$USDC,100,$GUARDIAN,1000000000000000000000,0,$TARGET)" --gas-limit 600000 --rpc-url $RPC --private-key $GUARDIAN_KEY
fi
```

The router pulls only what the move needs. Chainlink's Sepolia feed must stay under the
52-hour `MAX_ORACLE_AGE`; it was four hours old when checked.
