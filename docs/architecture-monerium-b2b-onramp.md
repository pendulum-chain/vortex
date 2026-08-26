# Monerium B2B Onramp Architecture

Current end-to-end architecture of the quoteless EUR → USDC onramp for KYB'd corporate
clients. Normative security detail lives in
[`security-spec/05-integrations/monerium-b2b.md`](security-spec/05-integrations/monerium-b2b.md);
open parameters and their recommended values in
[`prd/monerium-onramp-deferred-decisions.md`](prd/monerium-onramp-deferred-decisions.md);
operator procedures in [`runbooks/monerium-b2b-onboarding.md`](runbooks/monerium-b2b-onboarding.md).

## The shape in one paragraph

Each corporate client is onboarded and KYB-approved by Monerium in Vortex's whitelabel
app (under the partner's KYC reliance) and owns a dedicated Monerium profile. Vortex
deploys one `VortexForwarder` contract clone per client, links it to that profile with an
attestor signature, and requests an IBAN **for the linked contract address** — the IBAN's
default mint destination *is* the forwarder. From then on the flow is passive on
Monerium's side: EUR received on the IBAN mints EURe to the forwarder, and Vortex's
keeper calls `swapAndForward()` on the contract, which swaps EURe → EURC → USDC on
Uniswap v3 (Chainlink-bounded minimum output) and transfers the USDC to the client's
fixed destination wallet, minus the configured fee to the treasury. The flow is
deliberately **not** a ramp: no quote, no `ramp_states` — the account is permanent and
repeatedly funded. Inside Vortex the client is a **managed child profile** under the
partner manager, which is what carries KYB records, API credentials, the read API, and
webhook tenancy.

## Onboarding sequence (per client)

1. **Monerium onboards the corporate** to the whitelabel app under the partner's
   reliance attestation; the profile arrives `approved`. (Vortex's KYB submission API is
   a deliberate 501 stub — registry T3.)
2. **Operator deploys the forwarder clone** via the factory (`cast`, runbook §2) with the
   client's `destination`, mandatory self-custodied `fallbackAddress`, and `feeBps`;
   generates and verifies the manifest.
3. **Admin mapping** — one idempotent call, `POST /v1/admin/monerium-b2b/accounts`:
   provisions the managed child (business `customer_entities` row under the manager),
   mirrors the approved KYB into `provider_customers` + `kyc_cases`, verifies the
   deployed clone on chain (factory registration, destination/fallback/feeBps
   read-back), and creates the `monerium_accounts` row (status `onboarding`) bound to
   the child via `vortex_profile_id`.
4. **Keeper automation** (every cycle, exactly-once via the profile-scoped
   `financial_operations` ledger): signs the fixed link message with the attestor key and
   `POST /addresses` links the forwarder to the Monerium profile, then `POST /ibans`
   requests issuance for that address. The `iban.updated` webhook records the IBAN on
   the account row.
5. **Penny test** (manual, runbook §7), then activation via
   `PATCH /v1/admin/monerium-b2b/accounts/:id/status` (refused until the IBAN exists).

## Deposit-to-payout sequence

1. **EUR arrives on the IBAN.** Monerium creates an `issue` order and mints EURe to the
   forwarder — no API call involved; incoming payments are passive.
2. **Vortex learns about it on three redundant channels** (all converge on the same
   per-forwarder advisory lock):
   - **Webhooks** (`order.created`/`order.updated`): HMAC-verified, persisted to the
     durable `monerium_webhook_events` inbox *before* the 200, then drained into
     `monerium_fiat_deposits` rows (forward-only status lattice, dedup by order id).
     This channel carries the order accounting: amount, state, compliance holds.
   - **The mint watcher**: scans EURe `Transfer` logs to known forwarders over a
     persisted block cursor (12-block reorg lag) and stamps the deposit's on-chain
     identity `(chain_id, tx_hash, log_index)`; unmatched inflows become flagged
     `unattr:` rows, never customer deposits.
   - **A balance check** in the worker as catch-all trigger: any forwarder holding EURe
     becomes a conversion candidate even if the other channels lag.
3. **Conversion.** For each candidate account the keeper (one designated backend, the
   mykobo flow variant) resolves leftover executions, then creates a
   `monerium_conversion_executions` row *before* broadcasting, persists the planned
   nonce, and sends `swapAndForward()`. The **contract** does the swap: it takes
   `min(balance, perSwapCap)` EURe through the pinned EURe→EURC→USDC pools with a
   Chainlink EUR/USD minimum-output bound, deducts `fee = usdcReceived * feeBps / 10000`
   to `FEE_RECIPIENT`, and transfers the rest to the client's `destination`.
4. **Finalization + attribution.** The `SwapExecuted` event's amounts are authoritative;
   the execution row is confirmed and open minted deposits are allocated to it
   oldest-first up to the swapped amount, USDC pro-rata by deposit size (R04).
5. **Partner visibility.** `DEPOSIT_RECEIVED` fires when a deposit is minted and
   `DEPOSIT_CONVERTED` once its execution is 32 blocks deep — durably, at-least-once,
   through the `webhook_deliveries` outbox to the **manager's** webhook subscription.
   Polling alternative: `GET /v1/monerium-b2b/account` and `/deposits` under managed
   delegation or the child's own credential.

## Batching and large deposits

Batching happens in both directions, automatically:

- **A large deposit is chunked.** One `swapAndForward()` call converts at most
  `perSwapCap`; the remainder stays on the forwarder and the keeper converts it on
  subsequent cycles (one execution row per chunk) until the balance is below
  `minSwapAmount`. A €120k deposit at a €25k cap becomes five executions a few minutes
  apart. The cap is an availability/price-impact parameter, not a safety bound — the
  oracle `minOut` is the safety bound.
- **Several small deposits merge.** The contract swaps the balance, not a deposit: two
  €5k deposits sitting on the forwarder convert in a single execution, and R04
  attribution splits the USDC back across both deposit rows pro-rata. A deposit that
  would only partially fit under the cap waits intact for the next execution — unless
  it is alone larger than the cap itself, in which case it attaches to the execution
  that begins converting it (it could never fit a later, smaller one), with its share
  clamped to the swapped amount.

## Fees

- **Rate (`feeBps`)**: per-client, fixed at clone initialization, capped by the
  implementation-immutable `MAX_FEE_BPS`. It is **immutable post-init by design** — fee
  immutability is part of the client guarantee (registry B1). "Dynamically adjusting"
  a client's fee therefore means deploying a **new clone** for them with the new rate
  and migrating: link the new clone to their profile and move the IBAN's default
  destination (`PATCH /ibans`) — a deliberate, monitored migration (the association
  monitor treats IBAN moves as an alert condition), not a config flip.
- **Destination (`FEE_RECIPIENT`)**: an immutable baked into the **implementation**
  contract at deployment, shared by every clone of that implementation. Changing the
  treasury address means deploying a new implementation + factory and using it for new
  clones. There is no per-client fee destination and no setter.
- The database mirrors `fee_bps` on `monerium_accounts` for accounting and drift
  detection only; the contract value is authoritative, and the config-reconciliation
  monitor alarms if they ever disagree.

## Data model

New tables (all introduced by this feature; migration numbers in parentheses):

| Table | Purpose |
|---|---|
| `monerium_accounts` (069, 071) | One row per client account: Monerium profile UUID, IBAN, forwarder/destination/fallback addresses, `fee_bps`, lifecycle status, dormancy marker, and `vortex_profile_id` → the owning managed child profile |
| `monerium_fiat_deposits` (069, 070, 073) | One row per Monerium issue order (or flagged `unattr:` inflow): amount in 18-dp base units, forward-only status, on-chain mint identity, allocation link to its execution, and the two webhook-emission markers |
| `monerium_conversion_executions` (069, 074) | One row per `swapAndForward()`, created before broadcast: EURe in, USDC gross/fee/net from the event, tx hash, planned nonce (crash recovery), status |
| `monerium_webhook_events` (069) | Durable persist-before-200 inbox for Monerium deliveries, dedup by event id, 30-day retention after processing |
| `monerium_chain_cursors` (070) | Persisted block cursors for the mint watcher |
| `webhook_deliveries` (072) | Generic durable outbox for the deposit-event webhook family: one row per (webhook, event), claim-based dispatch with backoff, 30-day retention after settling |

Rows created in **existing** tables per client: a `profiles` row (`kind = managed`) with
its `managed_profiles` relationship under the partner manager, a business
`customer_entities` row, a `provider_customers` row (`monerium`/`eur`, the Monerium
profile UUID) with an approved `kyb` `kyc_cases` row, `financial_operations` rows for
the exactly-once link/IBAN calls, and — registered by the partner — a user-owned
`webhooks` row subscribed to the deposit events.

## Failure posture (pointers)

Webhook deliveries survive crashes (persist-before-200 inbox); provider onboarding calls
are exactly-once (`financial_operations`); a broadcast whose hash was lost is recovered
from the persisted nonce plus unclaimed `SwapExecuted` logs rather than re-sent; all
per-account writes serialize on one advisory lock; and the client always has two exits
that no operator failure can block — the fallback-address sweep and, past the trigger
delay, permissionless swap execution. Full invariants and threat model:
[`security-spec/05-integrations/monerium-b2b.md`](security-spec/05-integrations/monerium-b2b.md).
