# Legacy Cleanup Plan

This plan applies after every supported corridor is represented in the block-flow
catalog. Do not delete legacy code merely because `QuoteService` now enters through
the catalog: registration still contains provider-specific legacy branches, and some
block phases import reusable helpers from legacy directories.

## Preconditions

Cleanup can begin when all of the following are true:

1. Every supported quote request resolves through `flows/catalog.ts`.
2. Every mapped flow owns simulation, transaction preparation, phase ordering, and
   all required executors.
3. Provider-specific registration operations are flow-owned. This includes Avenia
   tickets, Alfredpay quote refresh/customer resolution, Mykobo intents and payment
   instructions, and offramp recipient validation.
4. `RampService` calls the resolved flow directly without
   `selectRampTransactionPreparationKind` or corridor-specific transaction builders.
5. Scenario tests cover quote creation, registration, signing, execution, recovery,
   and cleanup for every mapped flow.
6. Block implementations no longer import symbols from files scheduled for deletion.

## Delete

### Quote Pipeline

Delete the strategy/orchestrator architecture:

- `quote/core/quote-orchestrator.ts`
- `quote/routes/`
- Legacy-only pipeline types from `quote/core/types.ts`: `StageKey`, `Stage`,
  `EnginesRegistry`, and `IRouteStrategy`

Delete legacy engine implementations and their engine-specific tests:

- `quote/engines/initialize/`
- `quote/engines/fee/`
- `quote/engines/finalize/`
- `quote/engines/nabla-swap/`
- `quote/engines/squidrouter/`
- `quote/engines/pendulum-transfers/`
- `quote/engines/hydration/`
- `quote/engines/merge-subsidy/`
- `quote/engines/partners/`
- Discount engine classes under `quote/engines/discount/`

Do not delete `quote/engines/discount/helpers.ts` or
`quote/engines/mykobo-fee.ts` until the reusable behavior described below has moved.

### Transaction Route Builders

Delete the legacy dispatchers and corridor assemblers:

- `transactions/onramp/index.ts`
- `transactions/offramp/index.ts`
- `transactions/onramp/routes/`
- `transactions/offramp/routes/`
- Route-only types and validation under `transactions/onramp/common/` and
  `transactions/offramp/common/`

Do not delete shared transaction helpers still imported by blocks until those symbols
have moved.

### Ramp Registration Selection

Delete:

- `ramp/ramp-transaction-preparation.ts`
- `ramp/ramp-transaction-preparation.test.ts`
- The `selectRampTransactionPreparationKind` switch in `ramp.service.ts`
- `prepareOfframpBrlTransactions`
- `prepareOfframpNonBrlTransactions`
- `prepareAveniaOnrampTransactions`
- `prepareAlfredpayOnrampTransactions`
- `prepareMykoboOnrampTransactions`

The provider operations currently mixed into those methods must be represented by
flow-owned registration hooks before removing them.

### Phase Definitions And Handlers

Delete:

- `phases/ramp-flow-definitions.ts`
- Concrete legacy executors under `phases/handlers/`
- Legacy-only handler helpers and their tests
- `phases/register-handlers.ts` after application and test startup import
  `quote/blocks/register-handlers.ts` directly

Before deleting `ramp-flow-definitions.ts`, replace parity assertions against its
constants with explicit expected phase sequences owned by block tests.

### Obsolete Tests

Delete tests that exclusively verify removed strategies, engines, route builders, or
legacy handlers. Preserve their behavioral cases by moving them to block unit tests or
end-to-end corridor scenarios first. Do not delete a security regression merely
because its original implementation file is removed.

Delete or convert the block `*.txs.parity.test.ts` tests that compare
`Flow.prepareTxs` with legacy corridor transaction builders. Those comparisons cannot
remain after the legacy builders are deleted. Before removing them, preserve durable
transaction-plan expectations, including transaction presence, signer, network, nonce
lane/order, calldata invariants, and cleanup/recovery behavior, in block-owned tests or
end-to-end corridor scenarios that do not import legacy route preparation.

## Move Or Split First

The following files contain behavior currently reused by block flows. Move the named
behavior into block-neutral or block-owned modules before deleting their legacy
directories.

### Quote Primitives

- `quote/core/quote-fees.ts`: fee calculation used by `blocks/core/fees.ts`
- `quote/core/nabla.ts`: EVM Nabla quote calculation
- `quote/core/squidrouter.ts`: bridge quote and target-token helpers
- `quote/core/validation-helpers.ts`: amount and Alfredpay limits
- `quote/core/helpers.ts`: chain support, target fiat, and response formatting
- `quote/engines/discount/helpers.ts`: discount state and quote-consumption updates
- `quote/engines/mykobo-fee.ts`: Mykobo fee resolution and outage error

After these moves, reduce `quote/core/types.ts` to durable quote and partner contracts,
or move those contracts into the block core.

### Transaction Primitives

- `transactions/index.ts`: `encodeEvmTransactionData`
- `transactions/base/cleanup.ts`: Base cleanup approval preparation
- `transactions/onramp/common/transactions.ts`: destination transfer and backup
  approval builders
- `transactions/common/feeDistribution.ts`: EVM fee-distribution transaction builder

Delete the remaining legacy-only exports from these files after block users have moved.

### Execution Primitives

- `phases/evm-funding.ts`: EVM funding-account resolution
- `phases/handlers/helpers.ts`: destination funding constants and balance checks
- `phases/helpers/brla-onramp-hold.ts`: Avenia hold synchronization

Keep their regression tests and move them with the implementation.

## Keep

The following are not legacy corridor definitions:

- `quote/blocks/`
- `quote/index.ts`
- `quote/core/partner-resolution.ts`
- `quote/core/quote-context.ts`, or its eventual block-native replacement
- `quote/core/errors.ts`
- `phases/base-phase-handler.ts`
- `phases/phase-registry.ts`
- `phases/phase-processor.ts`
- `phases/meta-state-types.ts`
- `phases/post-process/`
- `transactions/validation.ts`
- Cleanup and recovery workers

`StateMetadata` may be narrowed only after persisted-ramp and recovery compatibility
has been reviewed. JSON fields used by active or recoverable ramps must not be removed
solely because new flows no longer write them.

## Deletion Order

1. Port all catalog flows and registration hooks.
2. Move the shared quote, transaction, and execution primitives listed above.
3. Replace the `RampService` preparation selector with flow-owned registration and
   preparation.
4. Point application and test startup directly at `registerBlockFlowHandlers`.
5. Delete legacy transaction route builders and static phase-flow constants.
6. Delete legacy concrete phase handlers.
7. Delete quote strategies, orchestrator, and engine classes.
8. Prune legacy quote-context and ramp-state fields after persisted-data review.
9. Run lint, API typecheck, all block tests, every corridor scenario, recovery tests,
   cleanup tests, and SDK contract tests.
10. Update the security specification to remove legacy implementation references and
    identify the block catalog as the sole source of corridor behavior.
