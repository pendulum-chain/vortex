# Inherited Issues

These are confirmed legacy behaviors faithfully retained by the block implementation. They are not intentional block adaptations or port regressions.

## External side effects and idempotency

### Avenia mint and PIX payout provider IDs are persisted after provider calls

- **References:** Mint creates the transfer ticket without persisting its ID in block `phases/avenia-mint/execution.ts:147-196`, matching legacy `phases/handlers/brla-onramp-mint-handler.ts:162-212`. PIX payout creates the ticket and only then stores `payOutTicketId` in block `phases/avenia-offramp-payout/execution.ts:54-67`, matching legacy `phases/handlers/brla-payout-base-handler.ts:109-143`.
- **Impact:** A crash after Avenia accepts either request but before durable state is written can repeat the provider operation on retry. Mint recovery relies on the eventual balance shortcut; PIX recovery has no ID with which to resume the first ticket.
- **Release relevance:** Pre-existing financial-operation duplication risk on Avenia corridors; not introduced by the block release.

### EVM Nabla approve and swap broadcasts have no durable idempotency marker

- **References:** Block approve and swap broadcast and await receipts without storing their hashes (`phases/nabla-swap/execution.ts:68-97`, `148-179`), as do legacy approve and swap (`phases/handlers/nabla-approve-handler.ts:123-153`, `phases/handlers/nabla-swap-handler.ts:188-224`).
- **Impact:** A crash after broadcast can cause retry of the same presigned transaction without first reconciling its hash or receipt. Nonce behavior may reject or identify the replay, but application recovery is not explicit and can strand the phase on ambiguous RPC results.
- **Release relevance:** Pre-existing Base Nabla recovery risk for EVM-ephemeral flows; release-relevant where automated crash recovery is required.

### Squid broadcasts and initial gas payment have broadcast-to-persist windows

- **References:** Block Squid approve/swap hashes are persisted only after `sendRawTransaction` returns (`phases/squid-router-swap/execution.ts:170-207`), preserving legacy ordering (`phases/handlers/squid-router-phase-handler.ts:185-207`). Initial Axelar gas is sent before subsidy recording and `squidRouterPayTxHash` persistence in block (`phases/squid-router-swap/execution.ts:444-461`, `743-779`) and legacy (`phases/handlers/squid-router-pay-phase-handler.ts:286-321`, `704-778`).
- **Impact:** A crash in either interval leaves no durable hash. Retry can rebroadcast a Squid transaction or pay Axelar gas again; a crash after gas payment can also leave subsidy accounting incomplete.
- **Release relevance:** Pre-existing cross-chain execution and operator-fund exposure on Squid corridors; not a block-port regression.

### Subsidy and final-settlement transfers are not durably claimed before send

- **References:** Block EVM pre/post subsidy sends before recording (`phases/subsidize-pre/execution.ts:143-175`, `phases/subsidize-post/execution.ts:174-205`), matching legacy (`phases/handlers/subsidize-pre-swap-handler.ts:262-295`, `phases/handlers/subsidize-post-swap-handler.ts:296-329`). Final settlement sends, waits, records the subsidy, and only then persists `finalSettlementSubsidyTxHash` (`phases/final-settlement-subsidy/execution.ts:272-335`), matching legacy transfer ordering (`phases/handlers/final-settlement-subsidy.ts:326-369`). Pendulum subsidy transfers likewise have no persisted operation marker (`phases/subsidize-pre/execution.ts:51-78`, `phases/subsidize-post/execution.ts:54-82`).
- **Impact:** A crash or ambiguous RPC failure after transfer can cause another operator-funded transfer before the recipient balance or subsidy record reflects the first. Final-settlement retries within one execution can also send a fresh funding-account transaction after a failed/unknown receipt.
- **Release relevance:** Pre-existing operator-fund and subsidy-accounting risk across subsidized corridors; materially release-relevant despite being inherited.

### Failed fixed-nonce payout transactions are rebroadcast

- **References:** Block Avenia and Mykobo payout executors rebroadcast the same presigned transaction after a stored receipt is not successful (`phases/avenia-offramp-payout/execution.ts:83-93`, `phases/mykobo-offramp-payout/execution.ts:44-56`). Legacy does the same (`phases/handlers/brla-payout-base-handler.ts:163-192`, `phases/handlers/mykobo-payout-handler.ts:40-76`).
- **Impact:** These payloads use a fixed nonce that a reverted transaction has already consumed, so rebroadcast cannot replace the failed transfer and recovery can loop while payout funds remain at the ephemeral address.
- **Release relevance:** Pre-existing failed-payout recovery defect on Avenia and Mykobo offramps; relevant to release readiness for failure scenarios, not evidence of port drift.

## Validation and completion evidence

### Destination transaction validation is incomplete

- **References:** Block validates only the destination recipient encoded in the presigned native/ERC-20 transfer and skips even that when `destinationAddress` is absent (`phases/destination-transfer/execution.ts:21-55`, `77-86`), exactly as legacy does (`phases/handlers/destination-transfer-handler.ts:21-55`, `80-89`).
- **Impact:** Execution does not comprehensively bind sender, chain, token contract, amount/value, nonce, and recipient to the registered intent before broadcast. Recipient-only validation cannot establish that the complete transaction matches the quote.
- **Release relevance:** Pre-existing transaction-integrity gap on destination-transfer flows; security-relevant for release review but not introduced by blocks.

### AssetHub source hash is not proven on-chain

- **References:** Block requires `assethubToPendulumHash` and checks the stored blueprint's network and signer, but never fetches the hash or proves inclusion, success, or transaction equivalence (`phases/fund-ephemeral/execution.ts:133-145`). Legacy is weaker and bypasses user-hash verification for AssetHub (`phases/handlers/fund-ephemeral-handler.ts:99-107`).
- **Impact:** A reported arbitrary/non-final/failed hash can satisfy the source-hash gate; later balance checks may limit progress, but the hash itself is not evidence of the intended AssetHub transfer.
- **Release relevance:** Inherited trust-boundary weakness. The block adds useful static checks, so this is not a regression, but on-chain provenance remains release-relevant for AssetHub offramps.

### Moonbeam-to-Pendulum arrival uses a greater-than-zero heuristic

- **References:** Block treats any positive Pendulum token balance as arrival (`phases/moonbeam-to-pendulum-xcm/execution.ts:24-30`, `55`), matching legacy (`phases/handlers/moonbeam-to-pendulum-xcm-handler.ts:53-66`, `98-100`). The legacy split-receiver path uses the same test (`phases/handlers/moonbeam-to-pendulum-handler.ts:54-67`).
- **Impact:** Pre-existing dust or a partial/unrelated transfer can suppress XCM submission or complete the wait without proving delivery of the quoted amount.
- **Release relevance:** Pre-existing completion-integrity risk on Moonbeam-to-Pendulum routes; relevant when ephemerals can hold residual token balances.

### Pendulum-to-AssetHub accepts a persisted hash without status or arrival proof

- **References:** Block returns immediately when `pendulumToAssethubXcmHash` exists and otherwise persists the submit result without checking source-chain success or AssetHub arrival (`phases/pendulum-to-assethub-xcm/execution.ts:11-22`). Legacy has the same behavior (`phases/handlers/pendulum-to-assethub-phase-handler.ts:12-45`).
- **Impact:** A stale, failed, or merely submitted hash advances the ramp even if XCM execution fails or destination assets never arrive.
- **Release relevance:** Pre-existing AssetHub delivery-evidence gap; directly relevant to release confidence for this corridor.

## Estimation and recovery heuristics

### Avenia Base simulation uses a Moonbeam transfer quote

- **References:** Block `simulateAveniaMint` requests `AveniaPaymentMethod.MOONBEAM` and returns Base output (`phases/avenia-mint/simulation.ts:35-69`, `82-108`); direct Base mint delegates to it (`phases/avenia-direct-mint/simulation.ts:9-20`). Legacy likewise estimated with a Moonbeam quote (`quote/engines/initialize/onramp-avenia.ts:43-55`, `79-98`).
- **Impact:** Base quote output and fees can be based on the wrong Avenia rail, affecting quoted output, fee accounting, and recovery thresholds when Base and Moonbeam pricing differ.
- **Release relevance:** Pre-existing quote-accuracy issue on Avenia Base routes; visible to users and therefore release-relevant, but not a block adaptation.

### Recovery uses 95% balance shortcuts

- **References:** Block skips Avenia mint at 95% of precomputed output (`phases/avenia-mint/execution.ts:39-42`, `92-103`) and Mykobo deposit does the same (`phases/mykobo-mint/execution.ts:24-49`). Legacy contains the corresponding Avenia and Mykobo shortcuts (`phases/handlers/brla-onramp-mint-handler.ts:39-42`, `85-101`; `phases/handlers/mykobo-onramp-deposit-handler.ts:25-28`, `59-70`).
- **Impact:** A partial or unrelated balance at the ephemeral can be treated as completed provider settlement, allowing downstream execution with up to a 5% shortfall before later subsidy/balance logic intervenes.
- **Release relevance:** Pre-existing settlement-evidence and subsidy-exposure heuristic on BRL/EUR onramps; release-relevant under partial-delivery recovery.

### Pendulum XCM recovery infers submission from balance depletion

- **References:** Block Avenia offramp treats a Pendulum balance below the planned transfer amount as evidence tokens already left and suppresses submission (`phases/avenia-pendulum-offramp/execution.ts:45-58`). This preserves the legacy recovery inference (`phases/handlers/pendulum-to-moonbeam-xcm-handler.ts:57-68`, `120-136`).
- **Impact:** Fees, prior spending, partial balances, or unrelated transfers can be mistaken for an already-submitted XCM, causing the phase to wait for a Moonbeam arrival that will not occur instead of broadcasting the intended transfer.
- **Release relevance:** Pre-existing recovery/liveness risk for Pendulum-to-Moonbeam transfer flows; not introduced by the block implementation.

## Cancellation and liveness

### Long waits do not consistently honor the phase abort signal

- **References:** Representative block loops/sleeps omit `AbortSignal`: Avenia PIX polling (`phases/avenia-offramp-payout/execution.ts:101-125`), Mykobo payout polling (`phases/mykobo-offramp-payout/execution.ts:64-93`), Pendulum-to-Avenia arrival (`phases/avenia-pendulum-offramp/execution.ts:59-64`), destination balance polling (`phases/destination-transfer/execution.ts:142-150`), and final-settlement receipt/backoff (`phases/final-settlement-subsidy/execution.ts:281-316`). Their legacy counterparts are likewise abort-unaware (`phases/handlers/brla-payout-base-handler.ts:234-276`, `phases/handlers/mykobo-payout-handler.ts:85-120`, `phases/handlers/pendulum-to-moonbeam-xcm-handler.ts:88-99`, `phases/handlers/destination-transfer-handler.ts:145-154`, `phases/handlers/final-settlement-subsidy.ts:332-369`).
- **Impact:** After the phase processor times out or aborts an execution, outstanding polling, receipt waits, and sleeps can continue consuming RPC/provider capacity and may overlap a retry, increasing duplicate-side-effect races.
- **Release relevance:** Pre-existing operational stability and concurrency risk under timeouts; release-relevant at production load, while Squid status polling is separately signal-aware.
