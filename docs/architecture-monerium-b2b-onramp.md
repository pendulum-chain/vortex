# Monerium B2B Onramp Architecture

Current end-to-end architecture of the quoteless EUR → USDC onramp for KYB'd corporate
clients. Normative security detail lives in
[`security-spec/05-integrations/monerium-b2b.md`](security-spec/05-integrations/monerium-b2b.md);
decisions, final parameters, and accepted risks in
[`adr-0005-monerium-b2b-onramp.md`](adr-0005-monerium-b2b-onramp.md);
launch gates in [`operations-monerium-b2b-rollout.md`](operations-monerium-b2b-rollout.md);
operator procedures in [`operations-monerium-b2b-runbook.md`](operations-monerium-b2b-runbook.md).

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

## System map

```mermaid
flowchart LR
    subgraph Partner["Partner (manager)"]
        PAPI[Partner backend]
    end

    subgraph Monerium
        IBAN["Client IBAN\n(default destination = forwarder)"]
        MAPI[Whitelabel API]
        MWH[Monerium webhooks]
    end

    subgraph Chain["Ethereum mainnet"]
        FWD["VortexForwarder clone\n(one per client)"]
        FACT[Factory + implementation]
        UNI[Uniswap v3\nEURe-EURC-USDC]
        LINK[Chainlink EUR/USD]
        DEST[Client wallet]
        TREAS[Treasury FEE_RECIPIENT]
    end

    subgraph Vortex["Vortex API (keeper backend)"]
        ADM["Admin API\n/v1/admin/monerium-b2b"]
        INBOX[("monerium_webhook_events\n(durable inbox)")]
        DP[Deposit processor]
        MW[Mint watcher]
        CE[Conversion executor]
        ONB[Onboarding automation]
        MONI[4 detection monitors]
        OUTBOX[("webhook_deliveries\n(durable outbox)")]
        READ["Read API\n/v1/monerium-b2b/*"]
    end

    IBAN -- "SEPA in => EURe minted" --> FWD
    MWH -- "order.*, iban.updated (HMAC)" --> INBOX
    INBOX --> DP
    MW -- "EURe Transfer logs" --> FWD
    CE -- "swapAndForward()" --> FWD
    FWD --> UNI
    FWD -- "minOut check" --> LINK
    FWD -- "USDC - fee" --> DEST
    FWD -- fee --> TREAS
    ONB -- "link address + request IBAN" --> MAPI
    MONI -- "association / config reads" --> MAPI
    OUTBOX -- "DEPOSIT_RECEIVED / DEPOSIT_CONVERTED" --> PAPI
    PAPI -- "poll (delegation)" --> READ
```

Trust boundaries worth holding onto: **Monerium controls where EURe mints** (the IBAN's
linked default address — which is why the association monitor exists); **the contract
controls where funds can go** (fixed `destination`, fee to the immutable treasury,
fallback sweep — the keeper can only ever trigger, never redirect); **Vortex controls
timing and accounting**, nothing more.

## Onboarding sequence (per client)

```mermaid
sequenceDiagram
    participant Op as Operator
    participant Adm as Vortex admin API
    participant K as Keeper (worker)
    participant M as Monerium
    participant C as Ethereum

    Note over M: Monerium onboards the corporate under partner reliance - profile "approved"
    Op->>C: deployForwarder(destination, fallback, feeBps) via factory
    Op->>Adm: POST /v1/admin/monerium-b2b/accounts
    Adm->>C: verify clone (isForwarder + config read-back)
    Adm->>Adm: managed child + KYB mirror + monerium_accounts row (onboarding)
    K->>M: POST /addresses (attestor-signed link)  [exactly-once]
    K->>M: POST /ibans for the forwarder address   [exactly-once]
    M-->>K: iban.updated webhook -> IBAN recorded
    Op->>M: penny test (simulated/real small SEPA)
    Op->>Adm: PATCH .../accounts/:id/status "active" (refused without IBAN)
```

Steps in prose:

1. **Monerium onboards the corporate** under the partner's reliance attestation; the
   profile arrives `approved`. (Vortex's KYB submission API is a deliberate 501 stub —
   registry T3.)
2. **Operator deploys the forwarder clone** with the client's `destination`, mandatory
   self-custodied `fallbackAddress`, and initial `feeBps`; manifest generated and
   verified.
3. **Admin mapping** — one idempotent call provisions the managed child, mirrors the
   approved KYB into `provider_customers` + `kyc_cases`, verifies the clone on chain,
   and creates the account row bound via `vortex_profile_id`.
4. **Keeper automation** links the forwarder (attestor signature) and requests the IBAN,
   each exactly-once through the profile-scoped `financial_operations` ledger; the
   `iban.updated` webhook records the IBAN.
5. **Penny test**, then activation via the admin status endpoint.

## Deposit-to-payout sequence

```mermaid
sequenceDiagram
    participant B as Client's bank
    participant M as Monerium
    participant F as Forwarder (chain)
    participant V as Vortex keeper
    participant P as Partner

    B->>M: SEPA transfer to the IBAN
    M->>F: mint EURe (automatic, no API call)
    M-->>V: order.created / order.updated webhook -> inbox -> deposit row
    V->>F: (watcher) sees the Transfer log -> stamps chain identity
    V->>V: DEPOSIT_RECEIVED -> outbox -> partner webhook
    V->>F: swapAndForward()  [execution row committed first]
    F->>F: swap min(balance, perSwapCap) via Uniswap, Chainlink minOut
    F->>P: USDC - fee to client wallet (fee to treasury)
    V->>V: finalize from SwapExecuted event + R04 attribution
    Note over V: 32 blocks later
    V->>P: DEPOSIT_CONVERTED -> outbox -> partner webhook
```

Vortex learns about a mint on **three redundant channels**, which all converge on the
same per-forwarder advisory lock: the **webhooks** carry the order accounting (amount,
order id, compliance holds), the **mint watcher** stamps the on-chain identity that
attribution needs, and a plain **balance check** in the worker makes any funded
forwarder a conversion candidate even if both other channels lag. Any one channel alone
is enough to get funds converted.

## How the mint watcher walks the chain

The watcher is a poll-based log scanner with a **persisted cursor** so no block range is
ever skipped or double-processed across restarts:

```mermaid
flowchart TD
    A[cycle start] --> B["safeHead = latest - 12\n(reorg confirmation lag)"]
    B --> C{cursor row exists?}
    C -- no --> D["bootstrap: create cursor at safeHead\n(history is covered by webhook-recorded orders)"]
    C -- yes --> E["fromBlock = cursor + 1\ntoBlock = min(safeHead, fromBlock + 2000)"]
    E --> F["getLogs: EURe Transfer -> any known forwarder"]
    F --> G["per log, under the forwarder lock:\nmatch to an open deposit (by tx hash, else amount)\nor record a flagged unattr: row"]
    G --> H["advance cursor to toBlock\n(only after processing)"]
    H --> A
```

The mechanics that matter:

- The cursor row (`monerium_chain_cursors` — one row per watcher and chain) stores
  the **last fully processed block**. It advances only *after* every log in the range
  was handled, so a crash mid-range means the next cycle re-scans the same range — and
  re-scanning is harmless because each mint's identity `(chain_id, tx_hash, log_index)`
  is a unique index: already-recorded mints are skipped.
- The scan stops **12 blocks below the head**: that identity is not reorg-stable
  (a dropped transaction re-mines with a different block and log index), so only
  settled blocks are read. The lag costs ~2.5 minutes of latency on the *chain-identity*
  channel only — the webhook channel and balance check are not delayed by it, so
  conversion itself is not slowed.
- Ranges are capped at 2,000 blocks per cycle, so after downtime the watcher catches up
  in bounded chunks instead of one unbounded `getLogs`.
- On first run there is no cursor: it bootstraps at the current settled head and scans
  only forward. Historic mints are already represented by webhook-recorded orders;
  back-filling their chain fields is a manual operation.

## Lifecycles

```mermaid
stateDiagram-v2
    direction LR
    state "Deposit (monerium_fiat_deposits)" as dep {
        [*] --> pending
        pending --> minted
        pending --> held
        pending --> returned
        held --> minted
        held --> returned
        minted --> [*]
        returned --> [*]
    }
```

```mermaid
stateDiagram-v2
    direction LR
    state "Execution (monerium_conversion_executions)" as exe {
        [*] --> pending2 : row committed BEFORE broadcast
        pending2 --> confirmed : receipt + SwapExecuted
        pending2 --> failed : revert / never sent / stale
        confirmed --> [*]
        failed --> [*] : retried via a NEW row (backoff)
    }
```

```mermaid
stateDiagram-v2
    direction LR
    state "Account (monerium_accounts)" as acc {
        [*] --> onboarding : admin mapping
        onboarding --> active : penny test + admin PATCH (needs IBAN)
        active --> suspended
        suspended --> active
        active --> closed
        suspended --> closed
    }
```

Deposit statuses are **forward-only** (a delayed or replayed webhook can never regress a
row), and a hashless pending execution is resolved by nonce classification against the
chain rather than guesswork. The account additionally carries a `dormant_since` marker
(guardian-paused after 60 days without a conversion; conversion stops, the protective
stranding marker still arms).

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

In normal operation merging is rare: the keeper runs every minute, so deposits share an
execution only when they arrive within about a minute of each other or during downtime.
And batching only ever merges deposits of the **same client** — every client has their
own forwarder, so cross-client funds never mix.

## Fees

- **Rate (`feeBps`)**: per-client, set at clone initialization and adjustable by the
  guardian via `setFeeBps`, always capped by the implementation-immutable
  `MAX_FEE_BPS`. Increases are announced on-chain and apply (permissionlessly) only
  after the 24 h `FEE_INCREASE_TIMELOCK`, so a client whose SEPA transfer is already
  in flight cannot be swapped under a silently higher fee; decreases are immediate
  (registry P11). Swaps always use the currently applied fee — an announced increase
  never touches a swap inside its window.
- **Destination (`FEE_RECIPIENT`)**: an immutable baked into the **implementation**
  contract at deployment, shared by every clone of that implementation. Changing the
  treasury address means deploying a new implementation + factory and using it for new
  clones. There is no per-client fee destination and no setter.
- The database mirrors `fee_bps` on the account row for accounting and drift detection
  only; the contract value is authoritative, and the config monitor reconciles
  guardian fee changes (warn + version bump) while alarming on anything unauthorized.

## Monitoring (detection-only)

Four monitors run from the keeper worker (rate-limited to one pass per ~30 minutes),
read-only — no keys, no transactions:

1. **Association monitor (the S1 detective control).** Per active account it re-reads
   the Monerium-side state — `GET /addresses?profile=` and the IBAN list — and diffs it
   against the database record. **Any** divergence is an error-level alert: the
   forwarder no longer linked, an extra address linked to the profile, the IBAN moved
   or unrecorded. This is the control for the structural risk that Vortex-held
   whitelabel credentials can change associations at Monerium: those changes cannot be
   prevented client-side, only detected fast.
2. **Executable-depth monitor.** QuoterV2 quotes on the pinned swap path vs Chainlink;
   price impact past the slippage bound is an alert before clients feel it.
3. **Stranded-balance monitor.** Forwarders holding EURe with the stranding marker
   armed too long — a keeper-outage signal (past the trigger delay, the permissionless
   fallback is live; funds are never at risk, conversion is just late).
4. **Config reconciliation.** Re-reads per-clone config and bytecode: client-authorized
   changes (destination/fallback) and guardian-authorized changes (feeBps, timelocked)
   are reconciled into the DB with a version bump; bytecode or registration drift is a
   should-be-impossible incident.

## Data model — the Monerium B2B tables

All tables below belong exclusively to this flow (the legacy Monerium OAuth/KYC
integration owns no tables of its own — it writes only `provider_customers` /
`kyc_cases`). Migration numbers in parentheses.

```mermaid
erDiagram
    profiles ||--o| monerium_accounts : "vortex_profile_id (managed child)"
    monerium_accounts ||--o{ monerium_fiat_deposits : "account_id"
    monerium_accounts ||--o{ monerium_conversion_executions : "account_id"
    monerium_conversion_executions |o--o{ monerium_fiat_deposits : "allocated_execution_id (R04)"
    webhooks ||--o{ webhook_deliveries : "webhook_id (deposit events)"

    monerium_accounts {
        uuid vortex_profile_id FK
        string monerium_profile_id UK
        string iban
        string forwarder_address UK
        string destination
        string fallback_address
        int fee_bps
        enum status
    }
    monerium_fiat_deposits {
        string monerium_order_id UK
        decimal amount_raw
        enum status
        string tx_hash
        int log_index
        uuid allocated_execution_id FK
    }
    monerium_conversion_executions {
        decimal eure_in_raw
        decimal usdc_net_raw
        string tx_hash
        int nonce
        enum status
    }
```

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
