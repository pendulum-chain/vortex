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
   one flow, instead of three times (quote strategy, `RampPhase[]` array,
   route-prep).
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
   parity tests are the accepted fallback.

**Scope:** the `BRL_ONRAMP_BASE_CROSS_CHAIN` corridor (Avenia PIX → BRLA on
Base → Nabla BRLA→USDC → fee distribution → Squid bridge → destination
transfer) — a **real production corridor**, expressed as a flow *family*
parameterized by destination chain and token. Lives entirely under
`apps/api/src/api/services/quote/blocks/` and coexists with the existing
quote engine — **zero edits outside `blocks/`** (production files are
imported read-only).

**Status:** `9 pass, 1 skip, 0 fail` across the two parity tests;
`bun typecheck` clean for `blocks/`. The derived `RampPhase[]` deep-equals
the production `BRL_ONRAMP_BASE_CROSS_CHAIN` array; the assembled
`unsignedTxs` + `stateMeta` deep-equal the production route-prep
(`transactions/onramp/routes/avenia-to-evm-base.ts`, cross-chain path)
under identical mocks. Every phase in the flow carries an executor ported
from the corresponding production handler (EVM/Base BUY slice),
registry-compatible via `BasePhaseHandler`, and — where its executors
consume presigned transactions — a `prepareTxs` leg ported from the
per-flow route-prep. **Nothing is wired into the PhaseProcessor,
QuoteService, or ramp registration yet**: the production handlers in
`phases/handlers/` and the route-prep in `transactions/` remain the ones
that run. The earlier Morpho example flow was removed together with the
Morpho production code; `MykoboMint` remains in the catalog for the EUR
corridors.

---

## Detail

### File layout

```
apps/api/src/api/services/quote/blocks/
  README.md                                    # this file
  core/
    types.ts                                   # PhaseIO, Phase, Flow, PhaseCtx, PrepareCtx, TxIntent
    io.ts                                      # requestToIO, evmIO
    flow.ts                                    # FlowBuilder + OutputOf<P>
    combinators.ts                             # branch(), passthrough()
    fees.ts                                    # computeFees(ctx)
    phase-flow.ts                              # assemblePhaseFlow(flow) -> RampPhase[]
    prepare.ts                                 # allocateNonces(intents) -> UnsignedTx[]
  phases/                                      # each phase module: simulate + executor(s) in
                                               # <name>.ts, presigned txs in <name>.transactions.ts
    avenia-mint.ts                             # fiat BRL -> BRLA on Base + brlaOnrampMint executor
    avenia-mint.transactions.ts                # baseCleanupBrla (cleanup lane) + taxId stateMeta
    mykobo-mint.ts                             # fiat EUR -> EURC on Base (simulate only, for EUR corridors)
    fund-ephemeral.ts                          # FundEphemeral(token, chain) + fundEphemeral executor
    subsidize-pre.ts                           # SubsidizePre<Token, Chain>() + subsidizePreSwap executor
    nabla-swap.ts                              # NablaSwap(chain, in, out) + nablaApprove/nablaSwap executors
    nabla-swap.transactions.ts                 # nablaApprove + nablaSwap + baseCleanupUsdc
    distribute-fees.ts                         # DistributeFees<Token, Chain>() + distributeFees executor
    distribute-fees.transactions.ts            # distributeFees (null when no fees)
    subsidize-post.ts                          # SubsidizePost<Token, Chain>() + subsidizePostSwap executor
    squid-router-swap.ts                       # SquidRouterSwap(from, to, fromToken, toToken) + swap/pay executors
    squid-router-swap.transactions.ts          # squidRouterApprove/Swap + backup* contingency lane
    final-settlement-subsidy.ts                # FinalSettlementSubsidy<Token, Chain>() + executor
    destination-transfer.ts                    # DestinationTransfer<Token, Chain>() + executor
    destination-transfer.transactions.ts       # destinationTransfer (first nonce on the destination chain)
  flows/
    brl-onramp-base-cross-chain.ts             # makeBrlOnrampBaseCrossChainFlow(toChain, toToken)
  __tests__/
    brl-onramp-base-cross-chain.parity.test.ts     # structure + parity + executors + compile-time + simulate
    brl-onramp-base-cross-chain.txs.parity.test.ts # unsignedTxs + stateMeta parity vs production route-prep
```

### Core types (`core/types.ts`)

```ts
export type TokenBrand = string;
export type ChainBrand = string;

export interface PhaseIO<Token extends TokenBrand = TokenBrand, Chain extends ChainBrand = ChainBrand> {
  amount: Big;                       // human-readable decimal
  amountRaw: string;                 // integer-string raw at token's decimals
  token: Token;
  chain: Chain;
  meta: Record<string, unknown>;     // phase-specific (route id, oracle price, subsidy, ...)
}

export interface Phase<I extends PhaseIO, O extends PhaseIO> {
  readonly name: string;
  readonly phases: RampPhase[];      // declared execution expansion
  readonly simulate: (input: I, ctx: PhaseCtx) => Promise<O>;
  readonly executors?: PhaseHandler[]; // one per entry in `phases`, same order
  readonly prepareTxs?: (ctx: PrepareCtx) => Promise<PreparedPhaseTxs>; // presigned-tx intents
}

export interface Flow {
  readonly name: string;
  readonly phases: RampPhase[];      // flatMap(p => p.phases)
  readonly executors: PhaseHandler[];// flatMap(p => p.executors ?? [])
  simulate(ctx: PhaseCtx): Promise<PhaseIO>;
  prepareTxs(ctx: PrepareCtx): Promise<PreparedFlowTxs>; // assembled UnsignedTx[] + stateMeta
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
type OutputOf<P> = P extends Phase<never, infer O> ? O : never;
type AnyPhase = Phase<never, PhaseIO>;   // internal type-erased storage

export class FlowBuilder<I extends PhaseIO, O extends PhaseIO> {
  private constructor(private readonly phaseList: AnyPhase[]) {}

  static start<P extends AnyPhase>(first: P): FlowBuilder<PhaseIO, OutputOf<P>>;
  pipe<P extends Phase<O, PhaseIO>>(next: P): FlowBuilder<I, OutputOf<P>>;
  build(name: string): Flow;
}
```

The internal list is stored as `Phase<never, PhaseIO>` — the honest
existential under contravariance (any phase is assignable to it, and it
cannot be *called* without a cast). The single `input as never` in
`build()`'s simulate loop is the one place the type system hands over to
the adjacency guarantee that `pipe` already enforced.

Runtime: `build()` stores the phases; `Flow.simulate(ctx)` runs
`computeFees(ctx)`, builds the first input via `requestToIO(ctx)`, then
sequentially calls `phase.simulate(prevOutput, ctx)`. `Flow.phases` =
`flatMap(p => p.phases)`; `Flow.executors` = `flatMap(p => p.executors)`.

### Executors (the execution side)

Each phase file defines executor class(es) extending the production
`BasePhaseHandler` (imported read-only from `services/phases/`), one per
`RampPhase` the phase declares. `Flow.executors` therefore lines up 1:1
with `Flow.phases` — asserted in the parity test. Wiring a corridor later
is one loop:

```ts
flow.executors.forEach(executor => phaseRegistry.registerHandler(executor));
```

Nothing calls this yet. The executors are faithful ports of the production
handlers, **sliced to the path this corridor exercises** (EVM ephemeral,
Base source chain, BUY direction):

| Executor | `RampPhase` | Ported from | Slice notes |
|----------|-------------|-------------|-------------|
| `BrlaOnrampMintExecutor` | `brlaOnrampMint` | `handlers/brla-onramp-mint-handler.ts` | Full port (already Base-specific). Waits for the Avenia subaccount balance, creates the live transfer ticket to the Base ephemeral, 95% recovery shortcut, 30-min payment timeout → `failed`. |
| `FundEphemeralExecutor` | `fundEphemeral` | `handlers/fund-ephemeral-handler.ts` | Source-chain gas funding (incl. presigned squid swap `value` extraction) + destination EVM funding for BUY. Pendulum/Polygon-Alfredpay branches and SELL user-tx verification not ported. |
| `SubsidizePreSwapExecutor` | `subsidizePreSwap` | `handlers/subsidize-pre-swap-handler.ts` | EVM branch only (`nablaSwapEvm` config). USD cap check + funding-account ERC-20 top-up + Subsidy record. |
| `NablaApproveExecutor` | `nablaApprove` | `handlers/nabla-approve-handler.ts` | EVM branch: broadcast presigned approve on Base. |
| `NablaSwapExecutor` | `nablaSwap` | `handlers/nabla-swap-handler.ts` | EVM branch: input-balance validation + broadcast presigned swap. Substrate soft-minimum dry-run not ported. |
| `DistributeFeesExecutor` | `distributeFees` | `handlers/distribute-fees-handler.ts` | EVM branch: `distributeFeeHash` idempotency, USDC fee-balance precondition, presigned broadcast. Substrate/Subscan branch not ported. |
| `SubsidizePostSwapExecutor` | `subsidizePostSwap` | `handlers/subsidize-post-swap-handler.ts` | EVM branch: tops up to the simulated Squid input (`evmToEvm.inputAmountRaw`) for BUY. |
| `SquidRouterSwapExecutor` | `squidRouterSwap` | `handlers/squid-router-phase-handler.ts` | Route short-circuits (direct transfer, Alfredpay, same-chain passthrough) dropped — a flow piping this block always bridges. Keeps approve+swap broadcast, hash persistence, `preSettlementBalance` snapshot. |
| `SquidRouterPayExecutor` | `squidRouterPay` | `handlers/squid-router-pay-phase-handler.ts` | One network-generic Axelar `addNativeGas` method replaces the three per-chain copies; clients created lazily. Status/balance `Promise.any` race kept. |
| `FinalSettlementSubsidyExecutor` | `finalSettlementSubsidy` | `handlers/final-settlement-subsidy.ts` | BUY branch: ≥90% bridge-delivery wait, `preSettlementBalance` delta, native→token SquidRouter top-up swap with USD cap, 5-attempt transfer loop. SELL/Alfredpay branches not ported. |
| `DestinationTransferExecutor` | `destinationTransfer` | `handlers/destination-transfer-handler.ts` | Full port: recipient validation of the presigned tx, nonce-gap guard, idempotency, broadcast. |

Executors intentionally read the **same `quote.metadata` keys and
`state.state` fields** as the production handlers (including the
cross-phase reads production performs, e.g. `subsidizePostSwap` reading
`evmToEvm.inputAmountRaw`) so a block-driven ramp is bit-compatible with a
handler-driven one during migration.

### Transaction preparation (the third leg)

Each phase module carries a sibling `<name>.transactions.ts` file defining
the presigned transactions its executors consume, wired into the phase
factory as `prepareTxs`. This replaces the per-flow route-prep
(`transactions/onramp/routes/avenia-to-evm-base.ts` for this corridor),
which builds the whole corridor's tx list in one function and re-derives
the corridor decision the quote strategy already made.

**Requirements (same ethos as invariant 1 & 2):**

- A phase's `prepareTxs` is **hermetic**: it derives everything from its
  own factory args (chain/token brands), its **own** simulated metadata
  key on the quote, and the corridor-level `PrepareCtx` (quote, EVM
  ephemeral, destination address, taxId). It never reads another phase's
  metadata and never knows its position in the flow.
- Phases whose executors sign live (funding-account subsidies, Avenia
  API calls, bridge gas payment) simply omit `prepareTxs`.
- **Nonces are a flow-level resource**, so no phase picks its own nonce.
  `prepareTxs` returns nonce-free `TxIntent`s; `Flow.prepareTxs` collects
  them in flow order and `allocateNonces` (core/prepare.ts) assigns
  nonces per `(network, signer)` in three lanes:

  | Lane | Meaning | Nonce position |
  |------|---------|----------------|
  | `main` | txs an executor broadcasts on the happy path | sequential, flow order |
  | `backup` | contingency txs (bridge-failure re-swap, recovery approval) | after all main txs on that network |
  | `cleanup` | post-`complete` dust sweeps | last on that network |

  An intent may set `reuseFirstMainNonce` to pin itself to the first
  main-lane nonce on its network — production's `backupApprove` trick, so
  a recovery tx can never be stranded behind an unreachable nonce.

**Ownership mapping for this corridor** (production route-prep line →
owning phase):

| Presigned tx | Lane | Owning phase | Rationale |
|--------------|------|--------------|-----------|
| `nablaApprove`, `nablaSwap` | main | `NablaSwap` | its executors broadcast them; amounts from `nablaSwapEvm` |
| `distributeFees` | main | `DistributeFees` | fee amounts from `quote.metadata.fees` |
| `squidRouterApprove`, `squidRouterSwap` | main | `SquidRouterSwap` | bridge input from `evmToEvm` |
| `destinationTransfer` | main | `DestinationTransfer` | delivers `quote.outputAmount` to the user |
| `backupSquidRouterApprove`, `backupSquidRouterSwap`, `backupApprove` | backup | `SquidRouterSwap` | contingency for *its* bridge falling short |
| `baseCleanupBrla` | cleanup | `AveniaMint` | sweeps dust of the token *it* minted |
| `baseCleanupUsdc` | cleanup | `NablaSwap` | sweeps dust of *its* swap output |

`Flow.prepareTxs` also assembles the `stateMeta` the route-prep used to
build: corridor-level fields (`destinationAddress`,
`evmEphemeralAddress`, `phaseFlow`, plus static flow facts like
`isDirectTransfer: false` passed via `build(name, staticStateMeta)`)
merged with each phase's contribution (`taxId` from `AveniaMint`,
`nablaSoftMinimumOutputRaw` from `NablaSwap`, `squidRouterQuoteId` /
`squidRouterReceiverId` / `squidRouterReceiverHash` from
`SquidRouterSwap`).

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

### Phase catalog

Every step in a corridor — including the "bookend" steps (funding, fee
distribution, subsidy, final settlement, delivery) — is a first-class
`Phase<I, O>` carrying both `simulate` and its executors. The flow
assembles them linearly.

| Phase | Type | `phases` | Meta keys written |
|-------|------|----------|------------------|
| `AveniaMint` | `Phase<PhaseIO<typeof FiatToken.BRL, "fiat">, PhaseIO<typeof EvmToken.BRLA, typeof Networks.Base>>` | `["brlaOnrampMint"]` | `aveniaMint`, `aveniaTransfer`, `fees` | 
| `MykoboMint` | `Phase<PhaseIO<typeof FiatToken.EURC, "fiat">, PhaseIO<typeof EvmToken.EURC, typeof Networks.Base>>` | `["mykoboOnrampDeposit"]` | `mykoboMint`, `fees` |
| `FundEphemeral(token, chain)` | `Phase<PhaseIO<Token, Chain>, PhaseIO<Token, Chain>>` | `["fundEphemeral"]` | (preserves) |
| `SubsidizePre<Token, Chain>()` | `Phase<PhaseIO<Token, Chain>, PhaseIO<Token, Chain>>` | `["subsidizePreSwap"]` | `subsidy` (partial) |
| `NablaSwap(chain, in, out)` | `Phase<PhaseIO<In, Chain>, PhaseIO<Out, Chain>>` | `["nablaApprove", "nablaSwap"]` | `nablaSwapEvm` |
| `DistributeFees<Token, Chain>()` | `Phase<PhaseIO<Token, Chain>, PhaseIO<Token, Chain>>` | `["distributeFees"]` | (preserves) |
| `SubsidizePost<Token, Chain>()` | `Phase<PhaseIO<Token, Chain>, PhaseIO<Token, Chain>>` | `["subsidizePostSwap"]` | `subsidy` (full) |
| `SquidRouterSwap(from, to, fromToken, toToken)` | `Phase<PhaseIO<FromToken, From>, PhaseIO<ToToken, To>>` | `["squidRouterSwap", "squidRouterPay"]` | `evmToEvm` |
| `FinalSettlementSubsidy<Token, Chain>()` | `Phase<PhaseIO<Token, Chain>, PhaseIO<Token, Chain>>` | `["finalSettlementSubsidy"]` | `subsidy` (full, overrides) |
| `DestinationTransfer<Token, Chain>()` | `Phase<PhaseIO<Token, Chain>, PhaseIO<Token, Chain>>` | `["destinationTransfer"]` | (preserves) |

`SquidRouterSwap` derives the bridge target from its **own** `toToken` /
`toChain` args (not from `ctx.request.outputCurrency`) — the phase carries
its complete contract in its signature.

### The flow family (`flows/brl-onramp-base-cross-chain.ts`)

The destination chain/token vary per request (`quote.to` /
`quote.outputCurrency`), so the corridor is a factory; the derived
`RampPhase[]` is identical for every destination:

```ts
export function makeBrlOnrampBaseCrossChainFlow<ToChain extends ChainBrand, ToToken extends TokenBrand>(
  toChain: ToChain,
  toToken: ToToken
): Flow {
  return FlowBuilder.start(AveniaMint)
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

### Parity (derived `RampPhase[]`)

`assemblePhaseFlow(flow)` deep-equals the hand-maintained
`BRL_ONRAMP_BASE_CROSS_CHAIN` in `phases/ramp-flow-definitions.ts`, for
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

`__tests__/brl-onramp-base-cross-chain.parity.test.ts` encodes the checks
every ported corridor must pass:

1. **Structural** — `flow.phases` equals the expected core phases array.
2. **Phase-flow parity** — `assemblePhaseFlow(flow)` deep-equals the
   production `BRL_ONRAMP_BASE_CROSS_CHAIN`, including for other
   destinations of the flow family.
3. **Executor coverage** — `flow.executors.map(e => e.getPhaseName())`
   deep-equals `flow.phases`: every execution phase has exactly one
   executor, in order.
4. **Compile-time adjacency** — a `// @ts-expect-error` block (wrong token
   after `AveniaMint`; Base-only phase after an Arbitrum bridge) is
   type-checked by tsc. If the brand guard were broken, the directives
   would be unused and `bun typecheck` would fail.
5. **Simulate smoke** — with externals mocked (`BrlaApiService`,
   `calculateNablaSwapOutputEvm`, `calculateEvmBridgeAndNetworkFee`,
   `priceFeedService`), `simulate(ctx)` lands on the destination
   token/chain with `amount > 0`.
6. **Metadata parity** — the final `PhaseIO.meta` carries the keys the old
   engines produce (`aveniaMint`, `aveniaTransfer`, `nablaSwapEvm`,
   `evmToEvm`, `subsidy`, `fees`) with the same field names, so existing
   route-prep and handlers read them unchanged.
7. **Transaction parity** (`brl-onramp-base-cross-chain.txs.parity.test.ts`)
   — under identical mocks (EVM fee estimation, Nabla/Squid tx creators,
   funding account, partner pricing), `flow.prepareTxs(ctx)` deep-equals
   the production `prepareAveniaToEvmOnrampTransactionsOnBase` output for
   the cross-chain path: the full `UnsignedTx[]` (phase, network, nonce,
   signer, txData) and the full `stateMeta`, plus an explicit assertion of
   the per-network nonce lanes.

### Meta accumulation and compatibility

`PhaseIO.meta` is a `Record<string, unknown>` bag that flows forward
through the pipeline. Each phase writes its data to a named key and
**spreads `input.meta`** so earlier phases' data is preserved. The final
meta is the union of all phase outputs — the subset of the old
`QuoteContext` bag this corridor uses.

**Invariant: meta is write-only during simulation.** No phase reads
`input.meta.<key>` to compute its output. Every phase is a pure function
of `(input, ctx)`. The only adjacency constraint is the `Phase<I, O>`
brand check enforced by `FlowBuilder.pipe`.

The three subsidy phases each independently call the shared
`computeExpectedOutput(ctx)` helper — they do not read each other's meta.
If multiple subsidy phases run, the last full `meta.subsidy` wins.
`computeFees(ctx)` runs before the flow; the first phase copies `ctx.fees`
into `meta.fees`.

### Conventions (non-negotiable)

- `bun`, never npm/yarn/pnpm. Run `bun lint:fix` then `bun typecheck` from
  the repo root.
- Biome: line width 128, 2-space indent, semicolons always, double quotes,
  no trailing commas.
- DO NOT add comments unless this doc explicitly asks. No docstrings on
  code you didn't touch.
- Surgical changes: touch only files under `blocks/`. Production files
  (`quote/core/*`, `engines/*`, `phases/*`, models, constants) are
  imported read-only, never edited.
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

### Port sources (per phase: simulate ← quote engine, executor ← handler, prepareTxs ← route-prep)

All `prepareTxs` legs are ported from
`transactions/onramp/routes/avenia-to-evm-base.ts` (cross-chain path) and
the helpers it delegates to (`transactions/onramp/common/transactions.ts`,
`transactions/common/feeDistribution.ts`, `transactions/base/cleanup.ts`)
— sliced per owning phase as per the ownership mapping above.

| Block | Simulate ported from | Executor(s) ported from |
|-------|---------------------|-------------------------|
| `AveniaMint` | `engines/initialize/onramp-avenia.ts` | `handlers/brla-onramp-mint-handler.ts` |
| `FundEphemeral` | (passthrough) | `handlers/fund-ephemeral-handler.ts` |
| `SubsidizePre` / `SubsidizePost` / `FinalSettlementSubsidy` | `engines/discount/onramp.ts` (simplified) | `handlers/subsidize-pre-swap-handler.ts`, `handlers/subsidize-post-swap-handler.ts`, `handlers/final-settlement-subsidy.ts` |
| `NablaSwap` | `engines/nabla-swap/base-evm.ts`, `core/nabla.ts` | `handlers/nabla-approve-handler.ts`, `handlers/nabla-swap-handler.ts` |
| `DistributeFees` | (deducts `ctx.fees.usd`) | `handlers/distribute-fees-handler.ts` |
| `SquidRouterSwap` | `engines/squidrouter/onramp-base-to-evm.ts`, `core/squidrouter.ts` | `handlers/squid-router-phase-handler.ts`, `handlers/squid-router-pay-phase-handler.ts` |
| `DestinationTransfer` | (passthrough) | `handlers/destination-transfer-handler.ts` |
| `computeFees` | `core/quote-fees.ts` | — |

All handler paths relative to `apps/api/src/api/services/phases/`.

### Known gaps & POC limitations

All intentional scope cuts, not bugs:

1. **Subsidy simplified.** The subsidy phases compute metadata from
   `ctx.partner.targetDiscount` / `maxSubsidy` + a single oracle price
   lookup. They do NOT port: the DB partner lookup
   (`resolveDiscountPartner`), the per-engine SquidRouter conversion-rate
   adjustment, or post-swap fee deduction from the "actual" amount.
2. **`computeFees` network fee = `"0"`, anchor fee from DB.** The
   production Avenia fee engine sets the anchor fee from the live Avenia
   mint/transfer fees and the network fee from a Squid quote; the blocks
   adapter reuses `calculateFeeComponents` only. Simulated amounts
   therefore drift from the old engine until fee parity (roadmap) is done.
3. **Executors are corridor slices.** EVM ephemeral, Base source, BUY
   direction. Substrate (Pendulum), Polygon/Alfredpay, and SELL branches
   of the production handlers are not ported — they belong to the
   corridors that exercise them.
4. **Executors keep production's cross-phase metadata reads** (e.g.
   `subsidizePostSwap` topping up to `evmToEvm.inputAmountRaw`) for
   bit-compatibility during migration. Persisting per-phase IO boundaries
   would remove these reads — deferred.
5. **`NablaSwap` runtime is Base-only.** `calculateNablaSwapOutputEvm`
   hardcodes `Networks.Base`; the `chain` arg is used for branding/IO.
6. **`PartnerInfo` import source.** Not exported from `@vortexfi/shared`;
   `core/types.ts` imports it from `../../core/types` (read-only).
7. **Smoke test mock leakage.** `mock.module("../../../priceFeed.service", ...)`
   does not fully intercept the real module. Harmless: oracle calls are
   wrapped in `try/catch` inside the phases, so the flow completes.
8. **`prepareTxs` is the cross-chain slice.** The production route-prep's
   direct-transfer and same-chain early returns are route decisions, not
   phase logic — they belong to the `BRL_ONRAMP_BASE_{DIRECT,SAME_CHAIN}`
   flows when those are ported (different pipelines, same blocks).
   Substrate corridors (Pendulum nonce bumps, XCM txs, `additionalTxs`
   meta) are untouched.

### Appendix: the existing code this refactor targets

The entanglement this model unwinds:

- **Quote side** (`apps/api/src/api/services/quote/`): `QuoteService` →
  `RouteResolver` → `QuoteOrchestrator` walks `stages: StageKey[]` calling
  `engine.execute(ctx)`. Strategies in `routes/strategies/`, engines in
  `engines/*`, all communicating through the ~25-field optional
  `QuoteContext` bag.
- **Execution side** (`apps/api/src/api/services/phases/` +
  `transactions/`): `PhaseProcessor` walks `state.state.phaseFlow`.
  Handlers read `quote.metadata.*` by string key. Route-prep picks the
  `phaseFlow` array AND builds `unsignedTxs` from the same metadata —
  re-deriving the corridor decision the quote strategy already made.
- **The gap:** quote stages ≠ execution phases; the mapping is implicit,
  spread across three files; `phaseFlow` correctness is runtime-only.

The block model closes that gap one corridor at a time, without a
big-bang rewrite: this corridor's quote simulation, phase sequence, and
execution handlers are now defined by a single flow.

### Roadmap (next steps, in priority order)

1. ~~**`prepareTxs` on `Phase`.**~~ **Done for this corridor.** Each phase
   declares its presigned transactions in `<name>.transactions.ts`
   (nonce-free `TxIntent`s in main/backup/cleanup lanes);
   `Flow.prepareTxs` allocates nonces per `(network, signer)` in flow
   order and assembles `stateMeta`. Asserted tx-for-tx against the
   production route-prep in the txs parity test.
2. **Wire the flow behind a flag.** Register `flow.executors` into the
   phase registry, route `QuoteService` through `flow.simulate`, and
   route ramp registration through `flow.prepareTxs` for this corridor;
   run real numerical parity vs `onrampAveniaToEvmBaseStrategy`
   (requires closing gap #2 first).
3. **Port the remaining corridors.** `EUR_ONRAMP_BASE_*` next (MykoboMint
   exists; executors for `mykoboOnrampDeposit` pending), then
   `BRL_ONRAMP_BASE_{DIRECT,SAME_CHAIN}` (subsets of this flow family),
   `ALFREDPAY_*`, the offramps.
4. **Persist per-phase IO boundaries** into metadata so executors read
   their own phase's simulated output instead of downstream keys (gap #4).
5. **Delete the old strategy + `ramp-flow-definitions.ts` entry + handlers**
   for each ported corridor once parity is proven.
