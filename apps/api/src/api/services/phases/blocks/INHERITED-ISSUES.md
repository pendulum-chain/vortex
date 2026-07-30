# Inherited Issues

These are active block behaviors inherited during the block migration. The former
quote engines, transaction builders, and concrete phase handlers have been deleted;
references below point only to the current block implementation. "Inherited" records
the behavior's historical origin, not an active legacy code path.

## Resolved: external side effects and idempotency

Provider order/ticket creation, Avenia and Mykobo payout broadcasts, Nabla approve/swap
broadcasts, Squid approve/swap broadcasts, Axelar gas payments, pre/post subsidies, and
final-settlement funding operations now claim a durable `financial_operations` row
before the external call. Confirmed results are replayed locally. Ambiguous outcomes
stop for reconciliation instead of repeating the call. Wallet-signed funding operations
pin the nonce across internal RPC retries, and a persisted failed fixed-nonce payout is
unrecoverable rather than rebroadcast.

The normative protocol, including the fallback for providers without an upstream
idempotency-key facility, is defined in
`docs/security-spec/03-ramp-engine/block-flow-architecture.md`.

## Validation and completion evidence

### Destination transaction validation is incomplete

- **References:** The destination executor validates only the recipient encoded in the presigned native/ERC-20 transfer and skips even that when `destinationAddress` is absent (`phases/destination-transfer/execution.ts:21-55`, `77-86`).
- **Impact:** Execution does not comprehensively bind sender, chain, token contract, amount/value, nonce, and recipient to the registered intent before broadcast. Recipient-only validation cannot establish that the complete transaction matches the quote.
- **Release relevance:** Pre-existing transaction-integrity gap on destination-transfer flows; security-relevant for release review but not introduced by blocks.

### AssetHub source hash is not proven on-chain

- **References:** The funding executor requires `assethubToPendulumHash` and checks the stored blueprint's network and signer, but never fetches the hash or proves inclusion, success, or transaction equivalence (`phases/fund-ephemeral/execution.ts:133-145`).
- **Impact:** A reported arbitrary/non-final/failed hash can satisfy the source-hash gate; later balance checks may limit progress, but the hash itself is not evidence of the intended AssetHub transfer.
- **Release relevance:** Inherited trust-boundary weakness. The block adds useful static checks, so this is not a regression, but on-chain provenance remains release-relevant for AssetHub offramps.

### Moonbeam-to-Pendulum arrival uses a greater-than-zero heuristic

- **References:** The XCM executor treats any positive Pendulum token balance as arrival (`phases/moonbeam-to-pendulum-xcm/execution.ts:24-30`, `55`).
- **Impact:** Pre-existing dust or a partial/unrelated transfer can suppress XCM submission or complete the wait without proving delivery of the quoted amount.
- **Release relevance:** Pre-existing completion-integrity risk on Moonbeam-to-Pendulum routes; relevant when ephemerals can hold residual token balances.

### Pendulum-to-AssetHub accepts a persisted hash without status or arrival proof

- **References:** The XCM executor returns immediately when `pendulumToAssethubXcmHash` exists and otherwise persists the submit result without checking source-chain success or AssetHub arrival (`phases/pendulum-to-assethub-xcm/execution.ts:11-22`).
- **Impact:** A stale, failed, or merely submitted hash advances the ramp even if XCM execution fails or destination assets never arrive.
- **Release relevance:** Pre-existing AssetHub delivery-evidence gap; directly relevant to release confidence for this corridor.

## Estimation and recovery heuristics

### Avenia Base simulation uses a Moonbeam transfer quote

- **References:** `simulateAveniaMint` requests `AveniaPaymentMethod.MOONBEAM` and returns Base output (`phases/avenia-mint/simulation.ts:35-69`, `82-108`); direct Base mint delegates to it (`phases/avenia-direct-mint/simulation.ts:9-20`).
- **Impact:** Base quote output and fees can be based on the wrong Avenia rail, affecting quoted output, fee accounting, and recovery thresholds when Base and Moonbeam pricing differ.
- **Release relevance:** Pre-existing quote-accuracy issue on Avenia Base routes; visible to users and therefore release-relevant, but not a block adaptation.

### Recovery uses 95% balance shortcuts

- **References:** Avenia mint skips at 95% of precomputed output (`phases/avenia-mint/execution.ts:39-42`, `92-103`) and Mykobo deposit does the same (`phases/mykobo-mint/execution.ts:24-49`).
- **Impact:** A partial or unrelated balance at the ephemeral can be treated as completed provider settlement, allowing downstream execution with up to a 5% shortfall before later subsidy/balance logic intervenes.
- **Release relevance:** Pre-existing settlement-evidence and subsidy-exposure heuristic on BRL/EUR onramps; release-relevant under partial-delivery recovery.

### Pendulum XCM recovery infers submission from balance depletion

- **References:** Avenia offramp treats a Pendulum balance below the planned transfer amount as evidence tokens already left and suppresses submission (`phases/avenia-pendulum-offramp/execution.ts:45-58`).
- **Impact:** Fees, prior spending, partial balances, or unrelated transfers can be mistaken for an already-submitted XCM, causing the phase to wait for a Moonbeam arrival that will not occur instead of broadcasting the intended transfer.
- **Release relevance:** Pre-existing recovery/liveness risk for Pendulum-to-Moonbeam transfer flows; not introduced by the block implementation.

## Resolved: cancellation and liveness

Every catalog-registered block executor accepts the processor's `AbortSignal`. Shared
polling helpers receive it, explicit timers use abort-aware `sleep`, provider and RPC
waits use `abortableCall`, and every durable financial operation checks the signal
before beginning its external call. Multi-call provider operations re-check between
calls. An underlying transport without native cancellation may finish the request it
already started, but the abandoned executor is detached and cannot begin subsequent
work; the financial operation remains `unknown` until reconciliation.
