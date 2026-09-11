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
| Fallback address | `0x976EA74026E726554dB657fA54763abd0C3a0aa9` |
| Local account id | `5ebca15c-dadf-4eeb-aabb-e9c7462ff6b3` |
| Mock Monerium profile id | `f436dbeb-6012-4688-ab3b-d2446980c835` |
| Managed profile id | `c419d077-3e2b-488a-b228-359311c63324` |
| Mock IBAN | `DE12500105170648489890` |

The reference deposit transferred 25 EURe to the forwarder in transaction
`0x727a53eb525e5851d8db38ea99c2f39633b6213de5757639d82e6c112e49079a`.
The live keeper confirmed conversion transaction
`0xb52f38073c41b5e8d2f89deab5c2b8536362acfd97903579113630fc02b58eb4`,
consumed the full 25 EURe, and forwarded `29.012924` USDC with a zero fee. These
addresses and hashes are evidence from that ephemeral run, not deployment pins; use the
receipts and addresses produced by each new run.

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
| `SLIPPAGE_BPS` | 100 |
| `MAX_FEE_BPS` | 100 |
| `SWEEP_DELAY` | 60 days |
| `TRIGGER_DELAY` | 24 hours |
| `POOL_FEE_EURE_EURC` | 500 |
| `POOL_FEE_EURC_USDC` | 500 |
| `RECOVERY_HASH` | `bytes32(0)` |
| `MIN_SWAP_FLOOR` | `25e18` |
| `CAP_CEILING` | `50000e18` |
| Initial `minSwapAmount` | `250e18` |
| Initial `perSwapCap` | `25000e18` |

After deployment, register Anvil account 1 as a keeper and lower the mutable minimum to
the immutable 25 EURe floor for this exercise:

```bash
cast send "$FACTORY" "setKeeper(address,bool)" "$KEEPER" true \
  --private-key "$GUARDIAN_KEY" --rpc-url http://127.0.0.1:8545

cast send "$FACTORY" "setMinSwapAmount(uint256)" 25000000000000000000 \
  --private-key "$GUARDIAN_KEY" --rpc-url http://127.0.0.1:8545
```

Deploy a zero-fee client clone as in §1.2. Use a fresh salt and record the predicted
address and receipt. Read back `destination()`, `fallbackAddress()`, `feeBps()`, and
`FACTORY()`, then require `factory.isForwarder(forwarder) == true` before continuing.

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
  "fallbackAddress": "<fallback-address>",
  "feeBps": 0
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

The log must contain `Starting Monerium B2B keeper worker`. Wait for one worker cycle
and verify `monerium_chain_cursors` contains `eure-mints:1` before sending the deposit;
otherwise the watcher's first-run bootstrap intentionally starts at the current settled
head and treats earlier chain history as out of scope.

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
expected path is deliberately `unattr:` rather than an attributed customer deposit. The
log should show an unattributed EURe mint followed by an execution allocation.

Verify the durable records:

```sql
SELECT monerium_order_id, amount_raw, status, tx_hash, log_index,
       block_number, allocated_execution_id
FROM monerium_fiat_deposits
WHERE account_id = '<account-id>';

SELECT eure_in_raw, usdc_gross_raw, fee_raw, usdc_net_raw, destination,
       tx_hash, nonce, block_number, status, error
FROM monerium_conversion_executions
WHERE account_id = '<account-id>';
```

Required results:

- One `minted` deposit with an `unattr:` order id, the real transfer hash and log index,
  and a non-null `allocated_execution_id`.
- One `confirmed` execution with the 25 EURe input, zero fee, non-null nonce/hash/block,
  destination matching the clone, and `error IS NULL`.
- The forwarder's EURe balance is zero.
- The destination's USDC balance increased by `usdc_net_raw`.
- The conversion receipt contains `SwapExecuted` from the clone and a USDC `Transfer`
  from the clone to the configured destination.

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
- The executor's durable path leaves a confirmed execution with its nonce, transaction
  hash, block number, amounts, destination, and deposit allocation recorded.
- The real contract accepts the current Chainlink EUR/USD answer and swaps successfully
  through the pinned EURe -> EURC -> USDC 5-bps Uniswap V3 path.
- Keeper authorization, the 25 EURe minimum, allowance reset, full EURe consumption,
  zero-fee accounting, and forwarding to the immutable per-client destination work
  together.
- Snapshot allocation links the observed deposit to the confirmed execution and assigns
  the full USDC output.

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
- It does not test fees above zero, fee-increase timelocks, per-swap-cap batching,
  sub-minimum accumulation, pause controls, dormancy, permissionless triggering,
  stranded-fund sweeping, fallback-key recovery, or client config rotation.
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
