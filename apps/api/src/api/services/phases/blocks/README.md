# Block-Based Quote Engine

## Abstract

A typed, composable **block** model for defining Vortex quote flows. Each
phase declares its input and output `PhaseIO<Token, Chain>` brands; a
`FlowBuilder.start(...).pipe(...).build(...)` chain enforces **at compile
time** that adjacent phases are compatible — a Base swap cannot feed a
Polygon-only transfer, a phase that bridges to Arbitrum cannot be followed
by a Base-only step. The execution `RampPhase[]` is derived from the flow
(`["initial", ...flow.phases, "complete"]`), and each phase also carries
its **executors** — the execution-side handlers for its `RampPhase`s — and
its **presigned transactions** (`prepareTxs`) — so the strategy, the
execution sequence, the brand-correctness check, the execution logic, and
the transactions the ephemerals/user must sign all live in one place.

### Design invariants (the ethos)

1. **Self-contained phases.** A phase owns the complete logic for its step
   on **all three** sides of the system: quote simulation (`simulate`),
   execution (`executors`, one per declared `RampPhase`), and transaction
   preparation (`prepareTxs` — the presigned transactions its executors
   expect the ephemeral/user to sign). One corridor is defined once, as
   one flow instead of separate quote, phase-order, and transaction-plan
   definitions.
2. **Composition only through the typed IO boundary.** A phase sees its
   input `PhaseIO` — funds of token `T` on chain `C`, plus signature or
   contract-execution data accumulated in `meta` — and produces an output
   `PhaseIO`. It knows nothing else: not which phases surround it, not its
   position in the flow, and never another phase's `meta`. Anything a
   phase needs beyond its input must be derivable from the shared
   read-only `PhaseCtx` (request, partner, fees, notes). This applies to
   **every leg**: a phase's `simulate`, `executors`, and `prepareTxs` must
   all be hermetic and self-contained — `prepareTxs` reads only the
   phase's *own* simulated metadata key (e.g. `NablaSwap` reads
   `quote.metadata.nablaSwapEvm`, `SquidRouterSwap` reads
   `quote.metadata.evmToEvm`) plus corridor-level `PrepareCtx` data, never
   another phase's output. This is what makes phases removable,
   reorderable, and swappable.
3. **Adjacency mismatches fail at compile time — where the types can carry
   it.** `FlowBuilder.pipe` rejects a token- or chain-brand mismatch as a
   hard type error. `Phase.simulate` is declared as a *property function*
   (not a method) so the check is contravariant under `strictFunctionTypes`
   — a union or unbranded output cannot silently disable checking
   downstream. This is a strong preference, not an absolute: where full
   type-level enforcement would wreck readability, runtime checks and
   focused flow tests are the accepted fallback.

**Scope:** block flows are the production source of truth for quote simulation,
transaction preparation, phase ordering, and executor registration. The catalog
 currently maps the direct, Base-destination, and cross-chain BRL/Avenia and
 EUR/Mykobo onramps, their Base offramps, plus the AlfredPay flows,
 expressed as flow *families* parameterized by destination chain and token
where needed.
Unmapped corridors are rejected during quote creation until their flows are
ported. `BrlOnrampAssethubUsdc` and `BrlOfframpAssethubUsdc` are cataloged for
deterministic persisted-quote preparation and recovery, but an explicit
quote-service gate keeps both BRL↔AssetHub directions disabled. Only AssetHub
USDC is represented; USDT, DOT, AlfredPay, and dormant Hydration variants are excluded.

**Status:** the block catalog is the sole production source for quote simulation,
ramp lifecycle work, transaction preparation, phase ordering, and executor
registration. `QuoteService` persists `{ globals, blocks }` metadata. Ramp
registration resolves that persisted request, calls `Flow.register`, persists any
same-phase metadata refreshes, and passes phase-owned facts into
`Flow.prepareTxs`. Ramp start resolves the same persisted flow and calls
`Flow.start`. Startup registers only catalog-derived executors before starting
recovery workers. Flow, transaction, registration, lifecycle, executor, wiring,
and corridor scenario tests pin explicit phase arrays and durable transaction-plan
expectations for signer/network nonce lanes, calldata, precision, cleanup, and
recovery. Compatibility fields needed by active ramps are projected from
namespaced phase facts/state; new phase state and native prefunding remain in the
namespaced block shapes.

---

## Detail

### File layout

```
apps/api/src/api/services/phases/blocks/
  README.md                                    # this file
  TYPE-SYSTEM.md                               # walkthrough of the FlowBuilder brand/adjacency type system
  INHERITED-ISSUES.md                          # active risks retained by the block implementation
  core/
    types.ts                                   # PhaseIO, Phase, Flow, PhaseCtx, PrepareCtx, TxIntent
    io.ts                                      # typed fiat/EVM/AssetHub request resolvers, evmIO
    metadata.ts                                # simulation context descriptors and accessors
    flow.ts                                    # FlowBuilder + metadata accumulation
    combinators.ts                             # branch(), passthrough()
    fees.ts                                    # computeFees(ctx)
    phase-flow.ts                              # assemblePhaseFlow(flow) -> RampPhase[]
    prepare.ts                                 # nonce allocation + native prefunding aggregation
    quote.ts                                   # production simulation, validation, persistence
    quote-response.ts                          # public response from flow metadata
    register.ts                                # persisted-flow assertion/preparation adapter
    settlement.ts                              # structural settlement baseline helpers
  flows/catalog.ts                             # authoritative request -> flow mapping
  register-handlers.ts                         # catalog-derived executor registration
  phases/                                      # one directory per block-owned phase
    alfredpay-{mint,offramp}/                  # provider lifecycle and execution
    avenia-{direct-mint,mint,moonbeam-mint}/   # BRL onramp variants
    avenia-{offramp-fee,offramp-payout,pendulum-offramp}/
    mykobo-{mint,offramp-fee,offramp-payout}/  # EUR provider phases
    {evm,assethub}-offramp-source/             # source validation and tx plans
    fund-ephemeral/                            # EVM/Substrate funding and source-hash checks
    nabla-swap/                                # EVM Nabla simulation, txs, and executors
    pendulum-{nabla-swap,offramp-nabla-swap}/  # Pendulum Nabla variants
    distribute-fees/                           # EVM fee distribution
    pendulum-distribute-fees/                  # Pendulum fee distribution
    {subsidize-pre,subsidize-post,final-settlement-subsidy}/
    pendulum-{subsidize-pre,subsidize-post,offramp-subsidize-pre,offramp-subsidize-post}/
    squid-router-swap/                         # passthrough, same-chain, and bridge variants
    {moonbeam-to-pendulum-xcm,pendulum-to-assethub-xcm}/
    destination-transfer/                      # destination delivery
  flows/
    alfredpay-onramp-direct.ts                 # Polygon passthrough/same-chain family
    alfredpay-onramp-cross-chain.ts            # makeAlfredpayOnrampCrossChainFlow(toChain, toToken)
    alfredpay-offramp.ts                       # supported EVM source -> AlfredPay fiat family
    brl-onramp-base-direct.ts                  # BRL -> BRLA on Base
    brl-onramp-base-same-chain.ts              # Base USDC passthrough and routed Base outputs
    brl-onramp-base-cross-chain.ts             # makeBrlOnrampBaseCrossChainFlow(toChain, toToken)
    brl-onramp-assethub-usdc.ts                # disabled public corridor, retained for recovery
    brl-offramp-base.ts                        # supported EVM source -> BRL on Base
    brl-offramp-assethub-usdc.ts               # disabled public corridor, retained for recovery
    eur-onramp-base-direct.ts                  # EUR -> EURC on Base
    eur-onramp-base-same-chain.ts              # Base USDC passthrough and routed Base outputs
    eur-onramp-base-cross-chain.ts             # makeEurOnrampBaseCrossChainFlow(toChain, toToken)
    eur-offramp-base.ts                        # supported EVM source -> EUR on Base
  __tests__/
    brl-onramp-base-same-chain.flow.test.ts         # Base variant topology, executors, and simulation
    brl-onramp-base-same-chain.transactions.test.ts # Base variant tx/state/nonce expectations
    brl-onramp-base-cross-chain.flow.test.ts        # structure, executors, adjacency, and simulation
    brl-onramp-base-cross-chain.transactions.test.ts# unsignedTxs and namespaced state expectations
    eur-onramp-base-direct.flow.test.ts
    eur-onramp-base-direct.registration.test.ts
    eur-onramp-base-direct.transactions.test.ts
    eur-onramp-base-cross-chain.flow.test.ts
    eur-onramp-base-cross-chain.registration.test.ts
    eur-onramp-base-cross-chain.transactions.test.ts
    eur-offramp-base.flow.test.ts
    eur-offramp-base.transactions.test.ts
    alfredpay-onramp.lifecycle.test.ts           # start-time quote refresh and order creation
    alfredpay-offramp.lifecycle.test.ts          # registered-order start behavior
    *.executor.test.ts                           # block-owned execution behavior
    wiring.test.ts                               # catalog executor registry coverage
```

### Core types (`core/types.ts`)

```ts
export type TokenBrand = string;
export type ChainBrand = string;

export interface PhaseIO<Token extends TokenBrand = TokenBrand, Chain extends ChainBrand = ChainBrand> {
  amount: Big;                       // human-readable decimal
  amountRaw: string;                 // integer-string raw at token's decimals
  requestInputAmountUsd?: Big;       // source valuation carried across offramp phases
  token: Token;
  chain: Chain;
}

export interface Phase<Context extends AnyContextMetadata, I extends PhaseIO, O extends PhaseIO> {
  readonly context: Context;
  readonly name: string;
  readonly phases: RampPhase[];      // declared execution expansion
  readonly simulate: (input: I, ctx: PhaseCtx) =>
    Promise<PhaseResult<O, ContextSimulation<Context>>>;
  readonly executors?: PhaseHandler[]; // one per entry in `phases`, same order
  readonly prepareTxs?: (ctx: PrepareCtx<ContextSimulation<Context>>) =>
    Promise<PreparedPhaseTxs>;
  readonly register?: (ctx: RegisterCtx<ContextSimulation<Context>>) =>
    Promise<RegistrationResult>;
  readonly start?: (ctx: StartCtx<ContextSimulation<Context>>) =>
    Promise<StartResult>;
}

export interface Flow<O extends PhaseIO = PhaseIO> {
  readonly name: string;
  readonly phases: RampPhase[];      // flatMap(p => p.phases)
  readonly executors: PhaseHandler[];// flatMap(p => p.executors ?? [])
  simulate(ctx: PhaseCtx): Promise<{ expiresAt?: Date; metadata: FlowMetadata; output: O }>;
  register(ctx: FlowRegisterCtx): Promise<FlowRegistrationResult>;
  prepareTxs(ctx: FlowPrepareCtx): Promise<PreparedFlowTxs>;
  start(ctx: FlowStartCtx): Promise<FlowStartResult>;
}
```

`Token` and `Chain` are instantiated with literal types drawn from the
string enums (`EvmToken`, `FiatToken`, `AssetHubToken`) and `Networks` /
`"fiat"`. Brands are kept as `extends string` so literal narrowing flows
through generics. Note the brands are structural (string values), not
nominal: `EvmToken.USDC` and `AssetHubToken.USDC` are the same literal
type, so the **chain** brand carries the discrimination between
ecosystems.

`simulate` is a **property function type**, not a method — under
`strictFunctionTypes` this makes `pipe`'s input check contravariant, so a
phase whose declared output degrades to unbranded `PhaseIO` (or a union)
cannot be followed by a narrower-input phase without a compile error.

### `FlowBuilder` (`core/flow.ts`)

Compile-time adjacency is enforced via a **builder**, not a variadic
`flow()` function. The builder's `.pipe(next)` is a single method signature
with no overload fallback to escape to, so a brand mismatch is a hard type
error.

```ts
export class FlowBuilder<O extends PhaseIO> {
  private constructor(private readonly phaseList: AnyPhase[]) {}

  static start<First extends PhaseIO, Next extends PhaseIO>(
    inputResolver: FlowInputResolver<First>,
    first: AnyPhase & { simulate: (input: First, ctx: PhaseCtx) => Promise<PhaseResult<Next, unknown>> }
  ): FlowBuilder<Next>;

  pipe<Next extends PhaseIO>(
    next: AnyPhase & { simulate: (input: O, ctx: PhaseCtx) => Promise<PhaseResult<Next, unknown>> }
  ): FlowBuilder<Next>;

  build(name: string): Flow<O>;
}
```

The builder tracks a single type: the output of the most recently composed
phase. `pipe` checks the argument's `simulate` against it contravariantly and
infers the next output from the covariant return position. Simulation
metadata, registration facts, and registration input are typed per phase and
erased at the flow level (the catalog returns bare `Flow`, so nothing
downstream consumed them).

The internal list is stored as a type-erased `AnyPhase[]` whose simulation
input is `never`. Any concrete phase is assignable to it under
contravariance, but it cannot be called without a cast. The single
`input as never` in `build()`'s simulation loop is the handoff to the
adjacency guarantee that `pipe` already enforced.

`build()` rejects duplicate context keys at construction time; flows are
built at module load, so a duplicate key fails startup and every test run
immediately.

A phase may return a replacement fee snapshot when its provider quote is the
source of an anchor fee. `Flow.simulate` installs that snapshot before the next
phase and persists the final value in `globals.fees`. AlfredPay uses this
because its fiat anchor fee is only known after `AlfredpayMint.simulate` calls
the provider.

Runtime: `build()` stores the phases; `Flow.simulate(ctx)` runs
`computeFees(ctx)`, builds the first input via the source-aware resolver, then
sequentially calls `phase.simulate(prevOutput, ctx)`. `Flow.phases` =
`flatMap(p => p.phases)`; `Flow.executors` = `flatMap(p => p.executors)`.
Fiat, EVM, and AssetHub request resolvers validate token/chain at runtime;
on-chain resolvers convert request decimals to configured integer raw units.

### Executors (the execution side)

Each phase directory's `execution.ts` defines block-owned executor class(es)
extending `BasePhaseHandler`, one per `RampPhase` the phase declares.
`Flow.executors` therefore lines up 1:1 with `Flow.phases`, as asserted by the
flow and wiring tests. Registration is catalog-derived:

```ts
flow.executors.forEach(executor => phaseRegistry.registerHandler(executor));
```

Startup registers these executors from the flow catalog. There is no separate
concrete-handler registry. EVM, Substrate/XCM, provider mint/payout, funding,
subsidy, swap, fee distribution, final settlement, and destination delivery
executors all live beside their phase under `phases/`. `BlockInitialExecutor`
owns the `initial` phase and advances according to the persisted flow sequence.

Executors read their block's context from `quote.metadata.blocks`. Shared
quote facts live under `quote.metadata.globals`; untyped preparation outputs
live under the owning entry in `state.state.blockState`. Cross-block resource
needs are structural flow data rather than block dependencies: transaction
intents declare native prefunding and the flow aggregates it into
`state.state.transactionPlan`.

### Transaction preparation (the third leg)

Phase directories that require presigned transactions carry a `transactions.ts` file defining
the presigned transactions its executors consume, wired into the phase
factory as `prepareTxs`. No corridor-level transaction builder re-resolves the
route.

**Requirements (same ethos as invariant 1 & 2):**

- A phase's `prepareTxs` is **hermetic**: `Flow.prepareTxs` passes its
  typed `ownMetadata`, explicit globals, and `ownRegistrationFacts`. It never
  receives another phase's metadata and never knows its position in the flow.
- Registration is optional and phase-owned. `Flow.register` namespaces facts
  and response artifacts by context key, and a phase may refresh only its own
  metadata. Registration receives a read-only quote, authenticated user,
  normalized input, signing accounts, and optional DB transaction/IP context.
- Preparation account capabilities are keyed by `EphemeralAccountType`.
  EVM phases explicitly require EVM; destination address is optional in core.
- Phases whose executors sign live (funding-account subsidies, Avenia
  API calls, bridge gas payment) simply omit `prepareTxs`.
- **Nonces are a flow-level resource**, so no phase picks its own nonce.
  `prepareTxs` returns nonce-free `TxIntent`s; `Flow.prepareTxs` collects
  them in flow order and `allocateNonces` (core/prepare.ts) assigns
  nonces per `(network, signer)` in three lanes:

- **Native prefunding is a flow-level resource.** An intent may declare
  `prefundNativeValueRaw`; the flow sums those values per `(network, signer)`
  after every phase has prepared. `FundEphemeral` consumes that generic plan
  without knowing which phase requested the funds.

  | Lane | Meaning | Nonce position |
  |------|---------|----------------|
  | `main` | txs an executor broadcasts on the happy path | sequential, flow order |
  | `backup` | contingency txs (bridge-failure re-swap, recovery approval) | after all main txs on that network |
  | `cleanup` | post-`complete` dust sweeps | last on that network |

  An intent may set `reuseFirstMainNonce` to pin itself to the first
  main-lane nonce on its network — production's `backupApprove` trick, so
  a recovery tx can never be stranded behind an unreachable nonce.
  `nonceSpan` reserves consecutive nonces (default `1`); it must be a positive
  safe integer and cannot be combined with `reuseFirstMainNonce`.

**Transaction ownership mapping:**

| Presigned tx | Lane | Owning phase | Rationale |
|--------------|------|--------------|-----------|
| `nablaApprove`, `nablaSwap` | main | `NablaSwap` | its executors broadcast them; amounts from `nablaSwapEvm` |
| `distributeFees` | main | `DistributeFees` | fee amounts from `quote.metadata.fees` |
| `squidRouterApprove`, `squidRouterSwap` | main | `SquidRouterSwap` | bridge input from `evmToEvm` |
| `destinationTransfer` | main | `DestinationTransfer` | delivers `quote.outputAmount` to the user |
| `backupSquidRouterApprove`, `backupSquidRouterSwap`, `backupApprove` | backup | `SquidRouterSwap` | contingency for *its* bridge falling short |
| `baseCleanupBrla` | cleanup | `AveniaMint` | sweeps dust of the token *it* minted |
| `baseCleanupUsdc` | cleanup | `NablaSwap` | sweeps dust of *its* swap output |
| `polygonCleanup`, `alfredOnrampMintFallback` | cleanup | `AlfredpayMint` | cleanup and contingency transfer for its minted token |

For AlfredPay, `SquidRouterSwap` owns the Polygon source approve/swap and the
destination backup lane, using the phase-owned
`squidRouterSwap.inputAmountRaw` consistently.

`Flow.prepareTxs` assembles corridor-level fields (`destinationAddress`,
`evmEphemeralAddress`, `phaseFlow`, and static flow facts) separately from
owned `blockState`. Avenia owns its tax identifier, Nabla owns its soft
minimum, and Squid owns its route identifiers. Native call value belongs to
the flow-level transaction plan.

### `assemblePhaseFlow` (`core/phase-flow.ts`)

```ts
export function assemblePhaseFlow(flow: Flow): RampPhase[] {
  return ["initial", ...flow.phases, "complete"];
}
```

That's the whole thing. No phase-name knowledge, no route flags, no
`branch` logic. The developer pipes every step (funding, fee distribution,
subsidy, settlement, delivery) into the flow explicitly. Verbosity in flow
definitions is the deliberate tradeoff: a corridor's full execution shape
is readable top-to-bottom in one file.

### `branch()` and `passthrough()` (`core/combinators.ts`)

Kept as available primitives but **not relied upon**: destination variants
are expressed as a flow *family* (a factory over brands) rather than
runtime branches. Reach for `branch` only when a flow genuinely needs to
fork at simulate time; prefer separate flows otherwise. Note `branch`'s
static `phases` union is only valid when all branches expand to the same
`RampPhase` list.

### Representative phase catalog

Every step in a corridor — including the "bookend" steps (funding, fee
distribution, subsidy, final settlement, delivery) — is a first-class
`Phase<Context, I, O>` carrying its simulation context, `simulate`, and
executors. The flow assembles them linearly. The table shows the common EVM
building blocks; provider, offramp-source, Pendulum, and XCM blocks follow the
same contract under `phases/`.

| Phase | Metadata key | `phases` |
|-------|--------------|----------|
| `AlfredpayMint` | `alfredpayMint` | `["alfredpayOnrampMint"]` |
| `AveniaMint` | `aveniaMint` | `["brlaOnrampMint"]` |
| `MykoboMint` | `mykoboMint` | `["mykoboOnrampDeposit"]` |
| `FundEphemeral(token, chain)` | `fundEphemeral` | `["fundEphemeral"]` |
| `SubsidizePre<Token, Chain>()` | `subsidizePreSwap` | `["subsidizePreSwap"]` |
| `NablaSwap(chain, in, out)` | `nablaSwap` | `["nablaApprove", "nablaSwap"]` |
| `DistributeFees<Token, Chain>()` | `distributeFees` | `["distributeFees"]` |
| `SubsidizePost<Token, Chain>()` | `subsidizePostSwap` | `["subsidizePostSwap"]` |
| `SquidRouterSwap(from, to, fromToken, toToken)` | `squidRouterSwap` | `["squidRouterSwap", "squidRouterPay"]` |
| `FinalSettlementSubsidy<Token, Chain>()` | `finalSettlementSubsidy` | `["finalSettlementSubsidy"]` |
| `DestinationTransfer<Token, Chain>()` | `destinationTransfer` | `["destinationTransfer"]` |

`SquidRouterSwap` derives the bridge target from its **own** `toToken` /
`toChain` args (not from `ctx.request.outputCurrency`) — the phase carries
its complete contract in its signature.

`MykoboMint.register` derives the approved Mykobo customer from the authenticated
user, creates the provider deposit intent against the Base EVM ephemeral, and
returns IBAN response artifacts plus facts namespaced under `mykoboMint`.
`MykoboMint.prepareTxs` receives only those own registration facts, persists them
under `blockState.mykoboMint`, and owns the Base EURC cleanup approval where the
route can leave EURC dust. The direct Base EURC route emits no cleanup intent.

### The flow family (`flows/brl-onramp-base-cross-chain.ts`)

The destination chain/token vary per request (`quote.to` /
`quote.outputCurrency`), so the corridor is a factory; the derived
`RampPhase[]` is identical for every destination:

```ts
export function makeBrlOnrampBaseCrossChainFlow<ToChain extends ChainBrand, ToToken extends TokenBrand>(
  toChain: ToChain,
  toToken: ToToken
): Flow {
  return FlowBuilder.start(fiatRequestIO(FiatToken.BRL), AveniaMint)
    .pipe(FundEphemeral(EvmToken.BRLA, Networks.Base))
    .pipe(SubsidizePre<typeof EvmToken.BRLA, typeof Networks.Base>())
    .pipe(NablaSwap(Networks.Base, EvmToken.BRLA, EvmToken.USDC))
    .pipe(DistributeFees<typeof EvmToken.USDC, typeof Networks.Base>())
    .pipe(SubsidizePost<typeof EvmToken.USDC, typeof Networks.Base>())
    .pipe(SquidRouterSwap(Networks.Base, toChain, EvmToken.USDC, toToken))
    .pipe(FinalSettlementSubsidy<ToToken, ToChain>())
    .pipe(DestinationTransfer<ToToken, ToChain>())
    .build("BrlOnrampBaseCrossChain");
}
```

### Derived `RampPhase[]`

`assemblePhaseFlow(flow)` deep-equals the explicit expected array in the block test for
every destination instantiation:

```
["initial", "brlaOnrampMint", "fundEphemeral", "subsidizePreSwap",
 "nablaApprove", "nablaSwap", "distributeFees", "subsidizePostSwap",
 "squidRouterSwap", "squidRouterPay", "finalSettlementSubsidy",
 "destinationTransfer", "complete"]
```

The bookend `["initial", ..., "complete"]` is the only thing
`assemblePhaseFlow` adds. Everything else is declared by the flow itself.

### Verification

The `*.flow.test.ts` and `*.transactions.test.ts` suites encode the checks
every cataloged corridor must pass:

1. **Structural** — `flow.phases` equals the expected core phases array.
2. **Phase sequence** — `assemblePhaseFlow(flow)` deep-equals an explicit
   expected sequence, including other destinations of a flow family.
3. **Executor coverage** — `flow.executors.map(e => e.getPhaseName())`
   deep-equals `flow.phases`: every execution phase has exactly one
   executor, in order.
4. **Compile-time adjacency, build-time ownership** — `// @ts-expect-error`
   blocks cover wrong token/chain adjacency; they are type-checked by tsc,
   so if the brand guard were broken the directives would be unused and
   `bun typecheck` would fail. Duplicate metadata keys are pinned by a
   runtime test asserting `build()` throws.
5. **Simulate smoke** — with externals mocked (`BrlaApiService`,
   `calculateNablaSwapOutputEvm`, `calculateEvmBridgeAndNetworkFee`,
   `priceFeedService`), `simulate(ctx)` lands on the destination
   token/chain with `amount > 0`.
6. **Metadata ownership** — simulation returns explicit globals and exactly
    one typed context for each block in flow order. Subsidy contexts remain
    distinct.
7. **Transaction plans** — `*.transactions.test.ts` files assert the full
   `UnsignedTx[]` contract (phase, network, nonce, signer, and transaction
   data), namespaced `blockState`, cleanup/recovery lanes, and native
   prefunding without importing a second transaction assembler.
8. **Lifecycle and execution** — registration, lifecycle, and executor tests
   cover provider operations and phase behavior; wiring tests assert that the
   catalog supplies exactly one executor implementation per runtime phase.

### Metadata ownership

`PhaseIO` contains only typed monetary IO. Every block defines a local
`ContextMetadata` descriptor binding its key to its simulation type. `Phase`
carries that descriptor and returns exactly one simulation context; only
`Flow.simulate` accumulates those contexts into `{ globals, blocks }`.
Typed metadata access goes through context descriptors
(`getBlockMetadata(metadata, SomeContext)`) without a global key/type
registry. A phase cannot read previous metadata, and duplicate keys are
rejected when the flow is built at module load. Preparation and execution use
type-erased iteration internally, but the persisted envelope is bound to a
stable flow ID/version, topology hash, and per-context schema versions.
Runtime checks reject an incompatible identity, phase sequence, context set,
block-state envelope, or transaction plan before lifecycle hooks run. Tests
supplement these checks; they are not the runtime data boundary. Blocks never
declare dependencies on other block identities. Persisted decimal metadata
uses JSON-safe scalar unions, so consumers explicitly construct `Big` values
after loading JSONB. Fees, request data, and partner data are explicit globals
rather than metadata installed by the first block.
Offramp source phases carry the request's bridged USD valuation through the
typed `PhaseIO` boundary so downstream subsidy math does not read another
phase's metadata.

The three subsidy phases independently call `computeExpectedOutput(ctx)`
and persist distinct contexts. Their values no longer overwrite one shared
`subsidy` key.

### Conventions (non-negotiable)

- `bun`, never npm/yarn/pnpm. Run `bun lint:fix` then `bun typecheck` from
  the repo root.
- Biome: line width 128, 2-space indent, semicolons always, double quotes,
  no trailing commas.
- DO NOT add comments unless this doc explicitly asks. No docstrings on
  code you didn't touch.
- Keep block behavior under `blocks/`; shared ramp-state typing may be
  extended only for generic flow infrastructure such as `blockState` and
  `transactionPlan`.
- No over-engineering: no abstractions for single-use code, no error
  handling for impossible scenarios, no input validation for typed internal
  params.
- `FiatToken` has 6 values (EURC, ARS, BRL, USD, MXN, COP); any
  `Record<FiatToken, X>` must include all six.
- Mimic the import style of neighboring files.

### Brand values (enum member string values — keep adjacency consistent)

| Enum | Member | Value |
|------|--------|-------|
| `FiatToken` | `BRL` | `"BRL"` |
| `FiatToken` | `EURC` | `"EUR"` |
| `EvmToken` | `BRLA` | `"BRLA"` |
| `EvmToken` | `EURC` | `"EURC"` |
| `EvmToken` | `USDC` | `"USDC"` |
| `EvmToken` | `USDT` | `"USDT"` |
| `Networks` | `Base` | `"base"` |
| `Networks` | `Arbitrum` | `"arbitrum"` |
| `Networks` | `Polygon` | `"polygon"` |

**Gotcha:** `FiatToken.BRL` is `"BRL"` but `EvmToken.BRLA` is `"BRLA"`
(and `FiatToken.EURC` is `"EUR"` vs `EvmToken.EURC` `"EURC"`) — different
strings, so the brands are distinct types. This is what makes the
fiat→EVM boundary in `AveniaMint` / `MykoboMint` type-check: the output
brand genuinely differs from the input brand, and only the mint phase's
declared signature bridges them.

### Factory function call forms (TS has no generic const values)

| Export | Form | Why |
|--------|------|-----|
| `AveniaMint` | plain `const` (no generics) | no runtime variability |
| `MykoboMint` | plain `const` (no generics) | no runtime variability |
| `FundEphemeral(token, chain)` | generic **function with runtime args** | executor needs the runtime chain |
| `NablaSwap(chain, in, out)` | generic function with runtime args | needs runtime values for `getOnChainTokenDetails` |
| `SquidRouterSwap(from, to, fromToken, toToken)` | generic function with runtime args | needs runtime values for the bridge request; target token is the phase's own arg |
| `DistributeFees<Token, Chain>()` | type-args only | reads from `ctx.fees` |
| `SubsidizePre<Token, Chain>()` | type-args only | ctx-derived |
| `SubsidizePost<Token, Chain>()` | type-args only | ctx-derived |
| `FinalSettlementSubsidy<Token, Chain>()` | type-args only | ctx-derived |
| `DestinationTransfer<Token, Chain>()` | type-args only | pure passthrough in simulation |
| `passthrough<Token, Chain>()` | type-args only | pure no-op |
| `branch<I, O>(select, branches)` | generic function | runtime decision point |

**Brands are always enum member types** (`typeof EvmToken.BRLA`,
`typeof Networks.Base`), never plain string literals — keep this consistent
so adjacency matches.

### Current catalog boundaries

Unmapped cases fail at quote resolution; there is no alternate engine:

1. **Generic BRL/EUR onramp discounts.** `SubsidizePost` resolves the active
   corridor pricing config, applies the dynamic partner difference, and converts the
   oracle target into pre-bridge Base USDC using SquidRouter. Its typed input follows
   `DistributeFees`, so the actual amount already has network, vortex, and partner
   markup fees deducted without reading another block's metadata. AlfredPay retains
   its specialized pre-bridge subsidy path.
2. **BRL onramp fees.** `AveniaMint` replaces the anchor fee with the
   live mint/transfer fees and installs the Squid network fee before
   `DistributeFees`; direct BRLA and Base USDC routes keep a zero network fee.
3. **Executors cover the cataloged corridors.** EVM, Substrate/XCM, BUY, and
   SELL behavior is composed from the phase implementations selected by each
   flow.
4. **Some executors keep compatibility cross-phase metadata reads** (e.g.
   `subsidizePostSwap` topping up to `evmToEvm.inputAmountRaw`) where active
   persisted ramp state still uses corridor-level fields.
5. **`NablaSwap` runtime is Base-only.** `calculateNablaSwapOutputEvm`
   hardcodes `Networks.Base`; the `chain` arg is used for branding/IO.
6. **`PartnerInfo` import source.** Not exported from `@vortexfi/shared`;
   `core/types.ts` imports it from `../../core/types` (read-only).
7. **BRL Base variants are statically selected.** Base USDC omits Squid and
   uses `BRL_ONRAMP_BASE_SAME_CHAIN`; other configured Base outputs use the
   one-phase `SameChainSquidRouterSwap` block and
   `BRL_ONRAMP_BASE_SAME_CHAIN_SWAP`. The latter emits source approve/swap
   transactions only, with destination transfer at the next nonce and no
   Squid pay, backup bridge, or final-settlement work.
8. **EUR Base variants use the same static split.** Base EURC is owned only by
   `EurOnrampBaseDirect`; Base USDC uses `EUR_ONRAMP_BASE_SAME_CHAIN` without
   Squid; Base USDT, ETH, AXLUSDC, and BRLA use
   `EUR_ONRAMP_BASE_SAME_CHAIN_SWAP` with one Base-built same-chain Squid swap
   immediately before destination transfer. No same-chain variant includes
   Squid pay, backups, or final settlement.

### Runtime ownership

There are no parallel quote engines, route strategies, corridor transaction
assemblers, static flow definitions, or concrete handler implementations.
`flows/catalog.ts` resolves the request once; `Flow.simulate`, `Flow.register`,
`Flow.prepareTxs`, and `Flow.start` iterate the same ordered phase list; and
`register-handlers.ts` derives the runtime registry from catalog executors.
`RampService` adapts namespaced registration facts and response artifacts only
where persisted-ramp or API compatibility requires top-level fields.
