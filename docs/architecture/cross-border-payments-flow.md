# Cross-Border Payments Flow

**Status:** Draft

**Last updated:** 2026-07-27

**Scope:** Fiat-funded and crypto-funded payments from an authenticated sender to a third-party recipient in another Vortex corridor.

## Summary

Cross-border payments should be modeled as a first-class `CrossBorderTransfer` or
`PaymentIntent`, not exposed as a client-side sequence of one BUY ramp followed by one SELL
ramp.

The recommended delivery strategy has two stages:

1. **Immediate settlement for an already-payable recipient.** Both parties and the recipient's
   payout instrument are known before registration, so the client can generate fresh ephemeral
   accounts and presign the exact end-to-end route. This preserves Vortex's current
   non-custodial signing model.
2. **Delayed claim for a recipient who is not yet onboarded.** The funding leg settles into a
   policy-controlled transfer vault. After the recipient completes KYC/KYB and registers a
   payout instrument, Vortex creates a fresh settlement quote and a fresh settlement ephemeral.
   If the claim deadline passes before settlement starts, the sender may begin a refund.

The delayed flow must not use an ordinary client-held ephemeral account as a multi-day escrow.
Current ephemerals are designed for one short-lived, fully specified ramp. Keeping one funded for
days creates key-retention, quote-expiry, transaction-staleness, and recovery problems.

## Goals

- Let a KYB-approved company fund a transfer in its local corridor.
- Let an individual or company recipient onboard under its own identity in the payout corridor.
- Let the sender create a transfer before the recipient has completed onboarding.
- Keep recipient payout details provider-side; the sender sees only masked references.
- Guarantee that only one of settlement or refund can consume the funded value.
- Preserve Vortex's existing client-side ephemeral-key security model wherever the complete route
  is known at registration time.
- Present one transfer, one quote, and one status history to the sender even when Vortex executes
  several internal settlement legs.
- Make provider and on-chain recovery explicit instead of treating every failed payout as safely
  refundable.

## Non-goals

- Making KYC/KYB or fiat settlement trustless. A smart contract cannot independently verify a
  provider's compliance decision or whether fiat reached a bank account.
- Guaranteeing a multi-day foreign-exchange rate without pricing or hedging the exposure.
- Storing raw PIX keys, IBANs, CLABEs, routing numbers, or account numbers in Vortex.
- Replacing the existing self-onramp and self-offramp API in the first release.
- Re-enabling EUR while recipient onboarding and payout settlement use incompatible provider
  identities.

## Current architecture and gaps

Vortex already has most of the recipient identity model:

- `recipient_invitations` creates a shareable onboarding link.
- `sender_recipients` binds a sender entity to a recipient entity for a payout rail.
- `provider_customers` and `kyc_cases` hold recipient onboarding status.
- `recipient_payout_references` is intended to hold a thin provider-side payout pointer.
- `getTransferEligibility` checks invitation acceptance, relationship state, provider approval,
  recipient type/country, and a verified payout reference.

The remaining gaps are structural:

1. **No production path creates a verified recipient payout reference.**
2. **Ramp registration has one effective user.** Provider identity is derived from that user:
   current Mykobo and Alfredpay offramps therefore resolve the sender's payout identity. BRL can
   mechanically accept a third-party PIX destination, but that destination is not yet bound to a
   `sender_recipients` relationship.
3. **Eligibility is not a registration boundary.** It is currently an advisory endpoint.
4. **A ramp is one fiat side and one crypto side.** `RampDirection` is `BUY | SELL`; a
   fiat-to-fiat payment has two fiat sides.
5. **Only one nonterminal ramp is allowed per user.** A cross-border transfer cannot safely depend
   on a client coordinating two unrelated concurrent ramps.
6. **Registration is short-lived.** Quotes expire, and a registered ramp must start within the
   existing start window. Ephemeral transactions are generated for a specific quote, route,
   signer, nonce, recipient, and amount.
7. **Ephemeral private keys are client-side.** This is a core security property and should not be
   weakened implicitly to accommodate delayed claims.
8. **EUR is disabled at registration.** Dashboard onboarding currently uses Monerium while the
   dormant settlement route resolves Mykobo identity.

See:

- [`../security-spec/03-ramp-engine/recipient-transfers.md`](../security-spec/03-ramp-engine/recipient-transfers.md)
- [`../security-spec/02-signing-keys/ephemeral-accounts.md`](../security-spec/02-signing-keys/ephemeral-accounts.md)
- [`../security-spec/03-ramp-engine/transaction-validation.md`](../security-spec/03-ramp-engine/transaction-validation.md)
- [`../dashboard-app-spec.md`](../dashboard-app-spec.md)

## Design principles

### Two principals are mandatory

Every third-party payment has two independently authenticated compliance principals:

- **Sender principal:** owns the transfer, supplies funds, and must be approved for the funding
  corridor.
- **Recipient principal:** receives the payout and must be approved for the payout corridor.

The sender supplies only a `senderRecipientId`. The API derives and snapshots the recipient
entity, provider customer, and verified payout reference. Client input must never select a
recipient provider customer, tax ID, PIX key, or fiat account directly when recipient context is
present.

### Recipient eligibility is enforced atomically

At transfer registration or settlement preparation, Vortex must:

1. lock or otherwise serialize the transfer;
2. verify the authenticated sender owns the relationship;
3. verify the relationship is active and accepted;
4. run corridor-specific eligibility;
5. resolve the recipient provider identity and verified payout reference;
6. snapshot those identifiers on the transfer;
7. bind all generated transactions and provider operations to that snapshot.

The payout route must not be able to change through an `additionalData` update after registration.

### The sender sees one transfer

The public object should be a `CrossBorderTransfer`, even if the implementation uses child ramp
state or reuses existing phase handlers. Internal BUY/SELL details should not require client
coordination.

### Provider confirmation is authoritative

- A sender's "payment submitted" action is not proof that fiat arrived.
- A recipient's "claim" action is not proof that payout succeeded.
- On-chain token arrival, provider order state, and provider payout state remain authoritative.

## Flow A: already-payable recipient

This is the recommended first production flow.

### Preconditions

- Sender A is authenticated and KYB/KYC-approved for the funding corridor.
- Recipient B accepted the invitation.
- The sender-recipient relationship is active for the selected rail.
- Recipient B is KYC/KYB-approved for the payout provider, country, and customer type.
- Recipient B has a verified provider-side payout reference.

### Sequence

```mermaid
sequenceDiagram
    actor A as Sender A
    participant UI as Dashboard
    participant API as Vortex API
    participant In as Funding provider
    participant Chain as EVM route
    participant Out as Payout provider
    actor B as Recipient B

    A->>UI: Select B and enter payout amount
    UI->>API: Request cross-border quote
    API->>API: Verify sender and recipient eligibility
    API-->>UI: Combined rate, fees, minimum output, expiry

    UI->>UI: Generate fresh route ephemerals
    UI->>API: Register transfer with senderRecipientId and public ephemerals
    API->>API: Resolve and snapshot B's provider identity and payout reference
    API-->>UI: Unsigned end-to-end route transactions
    UI->>UI: Presign ephemeral-owned transactions
    UI->>API: Submit signed transactions
    API-->>UI: Funding instructions

    A->>In: Send local fiat
    In-->>API: Funding confirmed
    API->>Chain: Execute stablecoin route
    Chain-->>API: Destination settlement asset confirmed
    API->>Out: Create payout under B's provider identity
    Out-->>B: Pay local fiat
    Out-->>API: Payout complete
    API-->>UI: Transfer complete
```

### Signing model

Because A funds with fiat, no connected wallet is required. The dashboard generates the
ephemeral accounts and presigns every ephemeral-owned transaction, as it already does for BUY
ramps.

This model works only because B's provider identity, payout instrument, settlement chain, token,
amount policy, and destination are known before the funding instructions are released.

The API must extend ephemeral freshness checks to every chain on which the combined route signs.
On EVM networks, the same EVM ephemeral address may be used across chains, but each chain has an
independent nonce sequence.

### Recommended first corridor

Start with **BRL as the payout corridor**, funded from a live Alfredpay corridor:

```text
Sender fiat
  -> Alfredpay onramp under Sender A
  -> Polygon settlement token
  -> Squid route to Base USDC
  -> Base USDC/BRLA swap
  -> Avenia payout under Recipient B
  -> Recipient B's verified PIX destination
```

BRL is the cheapest recipient-context integration because the payout handler already supports a
third-party PIX destination mechanically. The first change is to derive the PIX key and receiver
tax ID from B's verified recipient context rather than accepting them freely from A.

Alfredpay recipient payouts require confirmation that Vortex can create an order against B's
provider customer and B's provider-owned fiat account. EUR should remain out of scope until the
Monerium/Mykobo identity mismatch is resolved.

## Flow B: delayed recipient claim

This flow lets A fund before B finishes onboarding.

### High-level flow

```mermaid
flowchart TD
    Create["A creates payment intent"] --> Invite["B receives invitation"]
    Create --> Funding["A funds using the local fiat rail"]

    Funding --> Vault["Stablecoin arrives in transfer vault"]
    Invite --> Kyc["B authenticates and completes target KYC/KYB"]
    Kyc --> PayoutRef["B registers provider-side payout instrument"]

    Vault --> Ready{"Funded and B eligible?"}
    PayoutRef --> Ready

    Ready --> Claim["B claims and accepts fresh settlement terms"]
    Claim --> Presign["Create fresh settlement ephemeral and presign exact payout route"]
    Presign --> Validate["API validates every signed transaction"]
    Validate --> Settle["Vault atomically enters settling and releases to the settlement route"]
    Settle --> Payout["Recipient-context offramp"]
    Payout --> Paid["Fiat paid to B"]

    Vault --> Deadline{"Claim deadline passed and settlement not started?"}
    Deadline --> Refund["Refund becomes available to A"]
    Refund --> CryptoRefund["Return stablecoin to A's wallet"]
    Refund --> FiatRefund["Or execute a self-offramp to A's verified bank account"]
```

### Why the vault is required

An ordinary ephemeral account is not a safe multi-day holding account:

- its private key exists only in the client or SDK environment;
- browser storage is exposed to same-origin XSS and may be lost;
- the settlement quote and payout provider order may not exist yet;
- exact destination, amount, calldata, nonces, and gas cannot be presigned reliably before B is
  eligible;
- the sender may not return to the same browser;
- a server-held copy would silently change Vortex's custody and key-management model.

The funding onramp should therefore finish with a dedicated `fundTransferVault` phase instead of
`destinationTransfer`.

### Claim sequence

1. B authenticates and presents the transfer/invitation token.
2. The API verifies that B is the accepted recipient.
3. The API refreshes compliance status and payout-reference status.
4. The API creates a fresh settlement quote. The original multi-day estimate is not reused.
5. B's browser generates a fresh settlement ephemeral. No connected wallet is required.
6. The API generates the exact settlement and payout transactions.
7. B's browser presigns the ephemeral-owned transactions.
8. The API validates the complete signed transaction set.
9. The database transfer and on-chain vault atomically move from `funded` to `settling`.
10. The vault releases only the authorized amount to the settlement route.
11. The phase processor completes the payout using B's provider identity.

The vault must not release funds before step 8. If B closes the browser after submitting the
signatures, the server can continue broadcasting the already-validated transactions without
holding B's ephemeral private key.

### Refund sequence

A refund is available only when:

- `claimBy` has passed;
- settlement has not started;
- no provider payout order with an uncertain outcome exists;
- the vault still controls the expected funds.

The sender may choose one of two refund modes at intent creation:

- **On-chain refund:** return the stablecoin to a sender-owned wallet.
- **Fiat refund:** execute a new self-offramp under A's own verified provider identity and payout
  instrument.

A smart-contract call cannot return funds directly to a bank account. Once the original fiat has
been converted into an on-chain asset, a bank refund is a new provider payout with a fresh quote,
fees, status, and recovery path.

## Transfer state machine

Suggested public states:

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> awaiting_funding
    draft --> cancelled

    awaiting_funding --> funded_pending_recipient: provider funding confirmed
    awaiting_funding --> timed_out

    funded_pending_recipient --> ready_to_settle: recipient eligible
    funded_pending_recipient --> refund_available: claim deadline passed

    ready_to_settle --> settling: signatures validated and vault claimed
    ready_to_settle --> refund_available: claim deadline passed first

    settling --> paid: provider payout confirmed
    settling --> needs_manual_recovery: outcome uncertain or route cannot continue

    refund_available --> refunding
    refunding --> refunded
    refunding --> needs_manual_recovery

    paid --> [*]
    refunded --> [*]
    cancelled --> [*]
    timed_out --> [*]
```

`settling` is a point of no automatic return. If funds have left the vault or a provider order may
still pay, the system must reconcile the route instead of refunding optimistically.

## Economic model for delayed claims

A quote cannot remain economically fixed for several KYC days unless Vortex accepts or hedges the
market exposure. The transfer must choose one of these policies:

### Fixed sender input

- A funds a fixed amount.
- The stablecoin principal is known after the onramp.
- B's payout is re-quoted at claim.
- A pre-authorizes `minimumPayoutAmount`, `maxSettlementFee`, and optionally
  `maxSlippageBps`.
- If the fresh quote is outside policy, A may approve new terms or refund.

This is the recommended MVP.

### Fixed recipient output

- A escrows the target payout plus a bounded buffer.
- The intent defines a maximum total cost.
- If settlement exceeds the authorized cost, A must top up or refund.

### Guaranteed recipient output

- Vortex guarantees the payout and hedges the exposure.
- The guarantee and hedge costs are included in the quote.

This is a treasury/risk-management product, not an MVP assumption.

All monetary values remain decimal strings or raw integer token amounts. They must never pass
through JavaScript `Number`.

## Smart-contract requirements

The delayed-claim vault should be a separate contract. The existing `TokenRelayer` is designed for
immediate permit-based execution against an immutable destination contract; it is not an escrow
or claim/refund state machine.

The vault should enforce:

1. one immutable transfer ID per deposit;
2. allowlisted tokens and supported chains;
3. exact deposited principal;
4. immutable claim deadline;
5. immutable refund beneficiary and refund mode commitment;
6. mutually exclusive `beginSettlement` and `beginRefund`;
7. settlement amount bounded by the recorded principal;
8. settlement only through allowlisted route adapters;
9. replay protection and per-transfer nonces;
10. no generic arbitrary-call executor;
11. global and per-transfer value limits;
12. pause and emergency-recovery controls;
13. owner/admin controls behind a multisig and preferably a timelock;
14. events for funding, settlement start, refund start, and terminal disposition.

The contract cannot verify:

- KYC/KYB approval;
- sanctions or transaction-monitoring results;
- provider-customer ownership;
- payout-instrument ownership;
- fiat payout finality.

Vortex therefore remains a trusted compliance attestor and fiat-settlement orchestrator. The
contract's job is narrower: protect principal, prevent double disposition, restrict execution,
and make custody transitions observable.

## Alternative designs

| Design                                             | Advantages                                                      | Main drawbacks                                                  | Recommendation                               |
| :------------------------------------------------- | :-------------------------------------------------------------- | :-------------------------------------------------------------- | :------------------------------------------- |
| Invite first, fund after B is approved             | Lowest custody and signing complexity                           | A cannot finalize the payment immediately                       | Ship before delayed escrow                   |
| Immediate first-class route for approved B         | Best near-term one-stop experience; preserves client ephemerals | B must already be payable                                       | Recommended first transfer flow              |
| Smart-contract transfer vault                      | Enforceable claim/refund exclusivity                            | Contract audit, compliance attestation, and recovery complexity | Recommended delayed-flow target              |
| Client-held funded ephemeral                       | Small backend change; non-custodial                             | Browser key loss/XSS; A must return; stale route                | Do not use for production delayed claims     |
| HSM/MPC-controlled transfer wallet                 | Unattended execution and easy re-quoting                        | Vortex becomes a stronger custodian; key and regulatory burden  | Consider only as an explicit custody product |
| Provider-native pending beneficiary transfer       | Provider may offer native reversal and compliance custody       | Corridor-specific and provider-dependent                        | Investigate opportunistically                |
| Pre-funded company treasury                        | Excellent repeat-payment UX                                     | Requires custody, balance accounting, and treasury controls     | Later business product                       |
| Vortex-funded payout followed by sender collection | Fastest recipient experience                                    | Credit, fraud, liquidity, and collections risk                  | Not an MVP                                   |

## Proposed data model

The exact schema should follow the repository's migration and security-spec conventions, but the
aggregate needs at least:

```text
cross_border_transfers
  id
  sender_customer_entity_id
  sender_recipient_id
  recipient_customer_entity_id
  recipient_payout_reference_id

  funding_country
  funding_rail
  funding_currency
  funding_amount

  payout_country
  payout_rail
  payout_currency
  estimated_payout_amount
  minimum_payout_amount
  max_settlement_fee

  settlement_network
  settlement_token
  funded_amount_raw
  vault_transfer_id

  quote_policy
  claim_by
  status
  failure_code

  funding_ramp_id
  settlement_ramp_id
  refund_ramp_id

  recipient_snapshot
  created_at
  updated_at
```

Provider and recipient snapshots must contain identifiers and status metadata only, not raw bank
PII.

The schema should also record append-only transition history and idempotency keys for provider
orders, vault actions, and refund actions.

## Proposed API surface

Names are illustrative:

```text
POST /v1/transfers/quotes
  Price a combined funding and payout route.

POST /v1/transfers
  Create a transfer or delayed payment intent.

GET /v1/transfers/:id
  Read the sender-visible aggregate status.

POST /v1/transfers/:id/register
  Register the immediate route or funding leg with fresh public ephemerals.

POST /v1/transfers/:id/update
  Submit validated presigned transactions or user-wallet hashes.

POST /v1/transfers/:id/start
  Begin provider-confirmed funding processing.

POST /v1/transfers/:id/claim
  Recipient-authenticated claim and fresh settlement preparation.

POST /v1/transfers/:id/settlement/update
  Submit the fresh settlement ephemeral's signed transactions.

POST /v1/transfers/:id/refund
  Sender-authenticated refund request after eligibility checks.
```

All mutating endpoints need idempotency keys. Ownership failures should remain uniform so foreign
transfer IDs do not become an existence oracle.

## Failure and recovery rules

| Failure point                                    | Funds location       | Safe action                                                               |
| :----------------------------------------------- | :------------------- | :------------------------------------------------------------------------ |
| Before provider funding                          | Sender's bank        | Cancel or let instructions expire                                         |
| Provider debit uncertain                         | Provider             | Reconcile provider status; do not create a second funding request blindly |
| Funded in vault, recipient pending               | Vault                | Wait until `claimBy`; then allow refund                                   |
| Settlement signatures invalid                    | Vault                | Reject and regenerate; funds remain refundable                            |
| Vault release not submitted                      | Vault                | Retry idempotently                                                        |
| Vault release submitted, chain outcome uncertain | Chain/vault          | Reconcile transaction before retry or refund                              |
| Settlement asset in ephemeral                    | Settlement ephemeral | Recover/retry using validated presigned transactions                      |
| Provider deposit sent, payout order not created  | Provider/ephemeral   | Reconcile balances and provider idempotency state                         |
| Payout order created, status uncertain           | Provider             | `needs_manual_recovery`; never auto-refund                                |
| Payout confirmed                                 | Recipient's bank     | Terminal `paid`                                                           |
| Refund asset released, fiat refund uncertain     | Refund provider      | Reconcile; never start a second refund blindly                            |

Every side effect must have an idempotency or re-execution guard. The transfer aggregate must not
depend solely on the current ramp processor's non-atomic multi-instance lock.

## Delivery plan

### Phase 0: make recipients payable

- Implement widget receive mode for provider-side payout-instrument creation.
- Create verified `recipient_payout_references` without storing raw payout PII.
- Add sender-side invitation revocation.
- Reconcile recipient list status with the authoritative eligibility endpoint.

### Phase 1: recipient-context crypto-to-fiat

- Extend registration with `senderRecipientId`.
- Resolve recipient provider identity and payout reference server-side.
- Enforce eligibility atomically.
- Start with BRL recipients and remove free-form recipient payout fields in recipient context.
- Verify provider-specific third-party payout semantics for Alfredpay.

This phase proves the most important authorization boundary before fiat-funded composition.

### Phase 2: immediate fiat-to-fiat

- Add the `CrossBorderTransfer` aggregate and combined quote.
- Build an end-to-end route for already-payable recipients.
- Reuse client-generated ephemerals and existing transaction validation.
- Expose one transfer status and webhook stream.
- Launch an Alfredpay funding corridor to a BRL recipient corridor first.

### Phase 3: invite first, fund later

- Let A create an unfunded payment intent while B onboards.
- Notify A when B becomes payable.
- Execute the Phase 2 route using a fresh quote.

This provides most of the intended product value without multi-day custody.

### Phase 4: funded delayed claim

- Implement and audit the transfer vault.
- Add `claimBy`, fresh settlement quoting, claim-time ephemeral signing, and on-chain refund.
- Add fiat refund through A's verified self-offramp path.
- Add operational reconciliation and manual-recovery tooling.

### Phase 5: additional corridors

- Add Alfredpay recipient payouts once recipient-owned order creation is confirmed.
- Reconcile Monerium onboarding with EUR settlement identity before enabling EUR.
- Add provider-native pending-transfer paths where they materially reduce custody.

## Open product and compliance decisions

1. Is the delayed transfer fixed-input, fixed-output, or guaranteed-output?
2. When does beneficial ownership of the stablecoin move from A to B: invite acceptance, claim,
   vault release, provider deposit, or fiat payout?
3. May A cancel before `claimBy`, or is the recipient protected by an irrevocable claim window?
4. What happens if A blocks B after funding but before claim?
5. Which compliance checks must be refreshed at claim and immediately before payout?
6. Must a recipient approval be sender-specific, or is corridor approval reusable across all
   sender relationships?
7. What is the refund destination for a sender without a wallet?
8. Who pays return-routing, provider, and FX costs on refund?
9. Which provider-side operations are idempotent, and which require Vortex-generated idempotency
   keys?
10. Is Vortex willing to operate a custody vault, or must the vault be structured and operated by
    a licensed provider?
11. What manual-review SLA applies once funds have left the vault but fiat payout is uncertain?
12. What value limits, velocity limits, and treasury reserves apply to each corridor?

## Security-spec impact

Before implementation, update or add normative security specifications for:

- cross-border transfer authorization and second-principal binding;
- transfer-vault custody, settlement, refund, and admin controls;
- combined quote lifecycle and claim-time re-quoting;
- payout-reference creation and provider ownership validation;
- transfer-level state-machine locking and idempotency;
- delayed-transfer cleanup and manual recovery;
- webhook ownership and event semantics for transfer aggregates;
- compliance-status refresh requirements at claim and payout.

The existing recipient-transfer section marked "PRESSING, TO BE DEFINED" should become
authoritative only after these invariants, state transitions, and corridor-specific payout
bindings are implemented and tested.
