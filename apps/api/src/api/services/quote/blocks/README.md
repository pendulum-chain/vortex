# Block-Based Quote Engine

## Abstract

A typed, composable **block** model for defining Vortex quote flows. Each
phase declares its input and output `PhaseIO<Token, Chain>` brands; a
`FlowBuilder.start(...).pipe(...).build(...)` chain enforces **at compile
time** that adjacent phases are compatible — a Base swap cannot feed a
Polygon-only transfer, a Morpho deposit on Arbitrum cannot follow a passthrough
that stayed on Base. The execution `RampPhase[]` is derived from the flow
(`["initial", ...flow.phases, "complete"]`), so the strategy, the execution
sequence, and the brand-correctness check all live in one place.

**Scope of this POC:** the `EUR_ONRAMP_MORPHO` corridor (Mykobo SEPA → EURC
on Base → Nabla EURC→USDC → Squid bridge → Morpho vault deposit) in two
variants (cross-chain, base-vault). Lives entirely under
`apps/api/src/api/services/quote/blocks/` and coexists with the existing
quote engine — **zero edits outside `blocks/`**.

**Status:** `8 pass, 1 skip, 0 fail` parity test. Compile-time adjacency
verified via a deliberately mis-ordered `@ts-expect-error` block in the
test. Both `assemblePhaseFlow(flow)` outputs deep-equal the hand-maintained
`EUR_ONRAMP_MORPHO` and `EUR_ONRAMP_BASE_MORPHO` arrays in
`phases/ramp-flow-definitions.ts`. The final `PhaseIO.meta` carries the
full `QuoteTicketMetadata` shape the old engines produced, so the existing
route-prep and handlers read it unchanged.

---

## Detail

### File layout

```
apps/api/src/api/services/quote/blocks/
  README.md                                    # this file
  core/
    types.ts                                   # PhaseIO, Phase, Flow, PhaseCtx
    io.ts                                      # requestToIO, evmIO
    flow.ts                                    # FlowBuilder + OutputOf<P>
    combinators.ts                             # branch(), passthrough()
    fees.ts                                    # computeFees(ctx)
    phase-flow.ts                              # assemblePhaseFlow(flow) -> RampPhase[]
  phases/
    mykobo-mint.ts                             # fiat EUR -> EURC on Base
    fund-ephemeral.ts                          # FundEphemeral<Token, Chain>()
    subsidize-pre.ts                           # SubsidizePre<Token, Chain>() + computeSubsidyMeta
    nabla-swap.ts                              # NablaSwap<Chain, In, Out>()
    distribute-fees.ts                         # DistributeFees<Token, Chain>()
    subsidize-post.ts                          # SubsidizePost<Token, Chain>()
    squid-router-swap.ts                       # SquidRouterSwap<From, To, Token>()
    final-settlement-subsidy.ts                # FinalSettlementSubsidy<Token, Chain>()
    morpho-mint.ts                             # MorphoMint<Chain>()
  flows/
    eur-onramp-morpho.ts                       # eurOnrampMorphoFlow + eurOnrampBaseMorphoFlow
  __tests__/
    eur-onramp-morpho.parity.test.ts           # structural + parity + compile-time + simulate
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

export interface PhaseCtx {
  request: CreateQuoteRequest & { userId?: string };
  partner: PartnerInfo | null;
  now: Date;
  notes: string[];
  addNote(note: string): void;
  fees?: {
    usd?: { vortex: string; anchor: string; partnerMarkup: string; network: string; total: string };
    displayFiat?: QuoteFeeStructure;
  };
}

export interface Phase<I extends PhaseIO, O extends PhaseIO> {
  readonly name: string;
  readonly phases: RampPhase[];      // declared execution expansion
  simulate(input: I, ctx: PhaseCtx): Promise<O>;
}

export interface Flow {
  readonly name: string;
  readonly phases: RampPhase[];      // flatMap(p => p.phases) over assembled phases
  simulate(ctx: PhaseCtx): Promise<PhaseIO>;
}
```

`Token` and `Chain` are instantiated with literal types drawn from
`EvmToken`, `FiatToken`, `AssetHubToken`, `PendulumCurrencyId`, and
`Networks` / `"Pendulum"` / `"Stellar"` / `"fiat"`. Brands are kept as
`extends string` so literal narrowing flows through generics.

### `FlowBuilder` (`core/flow.ts`)

Compile-time adjacency is enforced via a **builder**, not a variadic
`flow()` function. The builder's `.pipe(next)` is a single method signature
with no overload fallback to escape to, so a brand mismatch is a hard type
error.

```ts
type OutputOf<P> = P extends Phase<PhaseIO, infer O> ? O : never;

export class FlowBuilder<I extends PhaseIO, O extends PhaseIO> {
  private constructor(private readonly phaseList: Phase<PhaseIO, PhaseIO>[]) {}

  static start<P extends Phase<PhaseIO, PhaseIO>>(first: P): FlowBuilder<PhaseIO, OutputOf<P>>;
  pipe<P extends Phase<O, PhaseIO>>(next: P): FlowBuilder<I, OutputOf<P>>;
  build(name: string): Flow;
}
```

`OutputOf<P>` uses a conditional `infer` rather than a second generic
parameter — `start<P extends Phase<PhaseIO, O1>, O1>` widens `O1` to
`PhaseIO` (the constraint bound) during inference and severs the brand
chain at the first `.pipe()`. `OutputOf<P>` preserves the literal brand.

Runtime: `build()` stores the phases; `Flow.simulate(ctx)` builds the first
input via `requestToIO(ctx)`, then sequentially calls
`phase.simulate(prevOutput, ctx)`. `Flow.phases` =
`phaseList.flatMap(p => p.phases)`.

### `assemblePhaseFlow` (`core/phase-flow.ts`)

```ts
export function assemblePhaseFlow(flow: Flow): RampPhase[] {
  return ["initial", ...flow.phases, "complete"];
}
```

That's the whole thing. No phase-name knowledge, no `isBaseVault` flag, no
`branch` logic. The developer is responsible for piping every step
(including funding, fee distribution, subsidy, final settlement) into the
flow explicitly. Verbosity in flow definitions is the deliberate tradeoff:
a corridor's full execution shape is readable top-to-bottom in one file.

### `branch()` and `passthrough()` (`core/combinators.ts`)

```ts
export function branch<I extends PhaseIO, O extends PhaseIO>(
  select: (ctx: PhaseCtx) => Promise<number> | number,
  branches: Phase<I, O>[]
): Phase<I, O>;

export function passthrough<Token extends TokenBrand, Chain extends ChainBrand>(): Phase<
  PhaseIO<Token, Chain>,
  PhaseIO<Token, Chain>
>;
```

`branch` runtime-selects between phases; the output `O` is declared
explicitly (the common downstream shape) and each branch's `Phase<I, O>`
must produce IO assignable to `O`. `branch.phases` = the order-preserving
union of all branches' `phases`.

These are kept as available primitives but are **not relied upon** in the
POC flows — the cross-chain and base-vault variants are written as two
explicit flows rather than runtime branches. Reach for `branch` only when a
flow genuinely needs to fork at simulate time; prefer two flows otherwise.

### Phase catalog

Every step in a corridor — including the "bookend" steps (funding, fee
distribution, subsidy, final settlement) — is a first-class `Phase<I, O>`.
The flow assembles them linearly.

| Phase | Type | `phases` | Meta keys written | Notes |
|-------|------|----------|------------------|-------|
| `MykoboMint` | `Phase<PhaseIO<typeof FiatToken.EURC, "fiat">, PhaseIO<typeof EvmToken.EURC, typeof Networks.Base>>` | `["mykoboOnrampDeposit"]` | `mykoboMint`, `fees` | Plain `const` (no generics). Ports `engines/initialize/onramp-mykobo.ts`. Also copies `ctx.fees` into meta. |
| `FundEphemeral<Token, Chain>()` | `Phase<PhaseIO<Token, Chain>, PhaseIO<Token, Chain>>` | `["fundEphemeral"]` | (preserves) | Passthrough. Funding happens execution-side. |
| `SubsidizePre<Token, Chain>()` | `Phase<PhaseIO<Token, Chain>, PhaseIO<Token, Chain>>` | `["subsidizePreSwap"]` | `subsidy` (partial: `expectedOutputAmountDecimal`, `expectedOutputAmountRaw`) | Computes expected output via `computeExpectedOutput(ctx)` — no meta read. Exports shared `buildFullSubsidy` + `computeExpectedOutput` helpers. |
| `NablaSwap(chain, in, out)` | `Phase<PhaseIO<In, Chain>, PhaseIO<Out, Chain>>` | `["nablaApprove", "nablaSwap"]` | `nablaSwapEvm` | Generic with runtime args. Ports `engines/nabla-swap/base-evm.ts` + `core/nabla.ts:calculateNablaSwapOutputEvm`. |
| `DistributeFees<Token, Chain>()` | `Phase<PhaseIO<Token, Chain>, PhaseIO<Token, Chain>>` | `["distributeFees"]` | (preserves) | Reduces amount by `ctx.fees.usd`. |
| `SubsidizePost<Token, Chain>()` | `Phase<PhaseIO<Token, Chain>, PhaseIO<Token, Chain>>` | `["subsidizePostSwap"]` | `subsidy` (full) | Independently computes expected via `computeExpectedOutput(ctx)`, builds and writes full subsidy. No meta read. |
| `SquidRouterSwap(from, to, token)` | `Phase<PhaseIO<Token, From>, PhaseIO<Token, To>>` | `["squidRouterSwap", "squidRouterPay"]` | `evmToEvm` | Generic with runtime args. Ports `engines/squidrouter/onramp-base-to-evm.ts` + `core/squidrouter.ts:calculateEvmBridgeAndNetworkFee`. |
| `FinalSettlementSubsidy<Token, Chain>()` | `Phase<PhaseIO<Token, Chain>, PhaseIO<Token, Chain>>` | `["finalSettlementSubsidy"]` | `subsidy` (full, overrides) | Same as `SubsidizePost` — independently computes expected, builds full subsidy. Overwrites any earlier `meta.subsidy`. |
| `MorphoMint<Chain>()` | `Phase<PhaseIO<typeof EvmToken.USDC, Chain>, PhaseIO<typeof EvmToken.MORPHO_VAULT, Chain>>` | `["morphoDeposit"]` | `morphoDeposit` | Type-args only. Reads `input.chain` at runtime; calls `previewDeposit`. |

### The two flows (`flows/eur-onramp-morpho.ts`)

```ts
export const eurOnrampMorphoFlow: Flow = FlowBuilder.start(MykoboMint)
  .pipe(FundEphemeral<typeof EvmToken.EURC, typeof Networks.Base>())
  .pipe(SubsidizePre<typeof EvmToken.EURC, typeof Networks.Base>())
  .pipe(NablaSwap(Networks.Base, EvmToken.EURC, EvmToken.USDC))
  .pipe(DistributeFees<typeof EvmToken.USDC, typeof Networks.Base>())
  .pipe(SubsidizePost<typeof EvmToken.USDC, typeof Networks.Base>())
  .pipe(SquidRouterSwap(Networks.Base, Networks.Arbitrum, EvmToken.USDC))
  .pipe(FinalSettlementSubsidy<typeof EvmToken.USDC, typeof Networks.Arbitrum>())
  .pipe(MorphoMint<typeof Networks.Arbitrum>())
  .build("EurOnrampMorpho");

export const eurOnrampBaseMorphoFlow: Flow = FlowBuilder.start(MykoboMint)
  .pipe(FundEphemeral<typeof EvmToken.EURC, typeof Networks.Base>())
  .pipe(SubsidizePre<typeof EvmToken.EURC, typeof Networks.Base>())
  .pipe(NablaSwap(Networks.Base, EvmToken.EURC, EvmToken.USDC))
  .pipe(DistributeFees<typeof EvmToken.USDC, typeof Networks.Base>())
  .pipe(SubsidizePost<typeof EvmToken.USDC, typeof Networks.Base>())
  .pipe(MorphoMint<typeof Networks.Base>())
  .build("EurOnrampBaseMorpho");

export const eurOnrampMorphoPhaseFlow = assemblePhaseFlow(eurOnrampMorphoFlow);
export const eurOnrampBaseMorphoPhaseFlow = assemblePhaseFlow(eurOnrampBaseMorphoFlow);
```

No `WithSubsidy`, no `branch`, no `passthrough`. The two flows differ only
in whether the Squid bridge and the final settlement subsidy are present.

### Parity proof (derived `RampPhase[]` arrays)

`assemblePhaseFlow(flow)` produces arrays that deep-equal the hand-maintained
definitions in `phases/ramp-flow-definitions.ts`.

**Cross-chain** — deep-equals `EUR_ONRAMP_MORPHO` (lines 167-181):
```
["initial", "mykoboOnrampDeposit", "fundEphemeral", "subsidizePreSwap",
 "nablaApprove", "nablaSwap", "distributeFees", "subsidizePostSwap",
 "squidRouterSwap", "squidRouterPay", "finalSettlementSubsidy",
 "morphoDeposit", "complete"]
```

**Base vault** — deep-equals `EUR_ONRAMP_BASE_MORPHO` (lines 189-200):
```
["initial", "mykoboOnrampDeposit", "fundEphemeral", "subsidizePreSwap",
 "nablaApprove", "nablaSwap", "distributeFees", "subsidizePostSwap",
 "morphoDeposit", "complete"]
```

The bookend `["initial", ..., "complete"]` is the only thing
`assemblePhaseFlow` adds. Everything else is declared by the flow itself.

### Verification

`__tests__/eur-onramp-morpho.parity.test.ts` runs five kinds of checks:

1. **Structural** — `flow.phases` equals the expected core phases array
   (no bookends) for both flows.
2. **Phase-flow parity** — `assemblePhaseFlow(flow)` deep-equals the
   existing hand-maintained array for both flows (asserted via both the
   pre-derived constant and a direct call).
3. **Compile-time adjacency** — a `// @ts-expect-error` block
   (`FlowBuilder.start(MorphoMint<...>()).pipe(MykoboMint)`) is
   type-checked by tsc. If the brand guard were broken, the directive
   would be unused and `bun typecheck` would fail.
4. **Simulate smoke** — with externals mocked (`calculateNablaSwapOutputEvm`,
   `calculateEvmBridgeAndNetworkFee`, `MykoboApiService.defaultDepositFee`,
   `EvmClientManager.readContract`), each flow's `simulate(ctx)` returns a
   `PhaseIO` with `amount > 0`, `token === EvmToken.MORPHO_VAULT`, and
   non-empty `ctx.notes`.
5. **Metadata parity** — the final `PhaseIO.meta` carries every key the old
   engines produced (`mykoboMint`, `nablaSwapEvm`, `evmToEvm`, `subsidy`,
   `fees`, `morphoDeposit`) with the same field names, so the existing
   route-prep and handlers read it unchanged.

Final test run: `8 pass, 1 skip, 0 fail, 45 expect() calls`.

### Meta accumulation and compatibility

`PhaseIO.meta` is a `Record<string, unknown>` bag that flows forward
through the pipeline. Each phase writes its data to a named key
(`mykoboMint`, `nablaSwapEvm`, `evmToEvm`, `subsidy`, `morphoDeposit`)
and **spreads `input.meta`** so earlier phases' data is preserved:

```ts
return evmIO(token, chain, amount, amountRaw, {
  ...input.meta,                  // preserve everything from earlier phases
  mykoboMint: { ... },            // this phase's data
});
```

The final `PhaseIO.meta` is therefore the union of all phase outputs —
equivalent to the old `QuoteContext` bag, minus the fields the POC doesn't
use (`preNabla`, `*Xcm`, `hydrationSwap`, `alfredpayMint`, `aveniaMint`,
`evmToMoonbeam`, `moonbeamToEvm`, etc.). The `QuoteService` casts it to
`QuoteTicketMetadata` and stores it as `quote.metadata`:

```ts
const output = await flow.simulate(ctx);
quote.metadata = output.meta as QuoteTicketMetadata;
```

The existing route-prep (`transactions/onramp/routes/mykobo-to-evm-morpho.ts`)
already reads `quote.metadata.nablaSwapEvm.outputAmountRaw`,
`quote.metadata.evmToEvm.outputAmountRaw`, and
`quote.metadata.evmToEvm.inputAmountRaw` — these keys exist with the same
shapes as before. No route-prep or handler code needs to change.

**Invariant: meta is write-only during simulation.** No phase reads
`input.meta.<key>` to compute its output. Every phase is a pure function
of `(input, ctx)` — where `input` is the typed `PhaseIO` (amount, token,
chain) and `ctx` is the cross-phase context (request, partner, fees,
notes). This means any phase can be removed, reordered, or swapped without
breaking another phase's simulation logic. The only adjacency constraint
is the `Phase<I, O>` brand check enforced by `FlowBuilder.pipe`.

The three subsidy phases (`SubsidizePre`, `SubsidizePost`,
`FinalSettlementSubsidy`) each independently call the shared
`computeExpectedOutput(ctx)` helper to derive the oracle-based expected
output from `ctx.request` + `ctx.partner` — they do not read each other's
meta. `SubsidizePre` writes a partial `meta.subsidy` (just
`expectedOutputAmount*`); `SubsidizePost` and `FinalSettlementSubsidy`
each write the full `meta.subsidy` (including `actualOutputAmount*`,
`subsidyAmountInOutputToken*`, `idealSubsidy*`, `targetOutputAmount*`,
`applied`, `subsidyRate`, `partnerId`, `adjustedDifference`,
`adjustedTargetDiscount`). If multiple subsidy phases run, the last one
wins (its full `meta.subsidy` overwrites the prior). Each subsidy phase
computes the same expected output independently — `priceFeedService`
caches the oracle call so the cost is negligible.

`computeFees(ctx)` (which populates `ctx.fees`) runs before the flow;
`MykoboMint` copies `ctx.fees` into `meta.fees` so the final metadata
includes it. No phase reads `meta.fees` during simulation.

### Conventions (non-negotiable)

- `bun`, never npm/yarn/pnpm. Run `bun lint:fix` then `bun typecheck` from
  the repo root.
- Biome: line width 128, 2-space indent, semicolons always, double quotes,
  no trailing commas.
- DO NOT add comments unless this doc explicitly asks. No docstrings on
  code you didn't touch.
- Surgical changes: touch only files under `blocks/`. Do NOT modify any
  existing file outside `blocks/` (no edits to `quote/core/*`, `engines/*`,
  `phases/*`, `ramp-flow-definitions.ts`, etc.). The POC coexists with the
  old code.
- No over-engineering: no abstractions for single-use code, no error
  handling for impossible scenarios, no input validation for typed internal
  params.
- `FiatToken` has 6 values (EURC, ARS, BRL, USD, MXN, COP); any
  `Record<FiatToken, X>` must include all six.
- Mimic the import style of neighboring files (e.g.
  `engines/nabla-swap/base-evm.ts`).

### Brand values (enum member string values — keep adjacency consistent)

| Enum | Member | Value |
|------|--------|-------|
| `FiatToken` | `EURC` | `"EUR"` |
| `FiatToken` | `ARS` | `"ARS"` |
| `FiatToken` | `BRL` | `"BRL"` |
| `FiatToken` | `USD` | `"USD"` |
| `FiatToken` | `MXN` | `"MXN"` |
| `FiatToken` | `COP` | `"COP"` |
| `EvmToken` | `EURC` | `"EURC"` |
| `EvmToken` | `USDC` | `"USDC"` |
| `EvmToken` | `MORPHO_VAULT` | `"MORPHO VAULT"` |
| `Networks` | `Base` | `"base"` |
| `Networks` | `Arbitrum` | `"arbitrum"` |

**Gotcha:** `FiatToken.EURC` is `"EUR"` but `EvmToken.EURC` is `"EURC"` —
different strings, so the brands are distinct types. This is what makes
the fiat→EVM boundary in `MykoboMint` (input
`PhaseIO<typeof FiatToken.EURC, "fiat">` → output
`PhaseIO<typeof EvmToken.EURC, typeof Networks.Base>`) type-check: the
output brand genuinely differs from the input brand, and only
`MykoboMint`'s declared signature bridges them.

### Factory function call forms (TS has no generic const values)

| Export | Form | Why |
|--------|------|-----|
| `MykoboMint` | plain `const` (no generics) | no runtime variability |
| `NablaSwap(chain, in, out)` | generic **function with runtime args** | needs runtime values for `getOnChainTokenDetails`; brands inferred from args |
| `SquidRouterSwap(from, to, token)` | generic **function with runtime args** | needs runtime values for bridge request; brands inferred from args |
| `MorphoMint<Chain>()` | generic function with **type args only** | reads `input.chain` at runtime |
| `FundEphemeral<Token, Chain>()` | type-args only | pure passthrough |
| `DistributeFees<Token, Chain>()` | type-args only | reads from `ctx.fees` |
| `SubsidizePre<Token, Chain>()` | type-args only | writes `meta.expectedOutputAmount` |
| `SubsidizePost<Token, Chain>()` | type-args only | reads from `meta`, writes `meta.subsidy` |
| `FinalSettlementSubsidy<Token, Chain>()` | type-args only | finalizes subsidy |
| `passthrough<Token, Chain>()` | type-args only | pure no-op |
| `branch<I, O>(select, branches)` | generic function | runtime decision point |

**Brands are always enum member types** (`typeof EvmToken.EURC`,
`typeof Networks.Base`), never plain string literals — keep this consistent
so adjacency matches.

### Existing files to read before implementing (per phase)

| Block | Primary port source |
|-------|---------------------|
| `MykoboMint` | `engines/initialize/onramp-mykobo.ts`, `engines/initialize/index.ts` |
| `NablaSwap` | `engines/nabla-swap/base-evm.ts`, `engines/nabla-swap/onramp-mykobo-evm.ts`, `core/nabla.ts` |
| `SquidRouterSwap` | `engines/squidrouter/onramp-base-to-evm.ts`, `engines/squidrouter/index.ts`, `core/squidrouter.ts` |
| `MorphoMint` | `handlers/morpho-deposit-handler.ts`, `handlers/morpho-vault-config.ts`, `engines/initialize/offramp-from-evm-morpho.ts` |
| `SubsidizePre` / `SubsidizePost` / `FinalSettlementSubsidy` | `engines/discount/onramp.ts`, `engines/merge-subsidy/offramp-evm.ts`, `core/types.ts` (subsidy field) |
| `computeFees` | `core/quote-fees.ts`, `core/helpers.ts` |
| `assemblePhaseFlow` | `phases/ramp-flow-definitions.ts` (EUR_ONRAMP_MORPHO, EUR_ONRAMP_BASE_MORPHO) |

All paths relative to `apps/api/src/api/services/quote/` (or
`apps/api/src/api/services/` for `phases/` and `handlers/`).

### Known gaps & POC limitations

All intentional POC scope cuts, not bugs:

1. **Subsidy simplified.** `SubsidizePre` / `SubsidizePost` /
   `FinalSettlementSubsidy` compute subsidy metadata from
   `ctx.partner.targetDiscount` / `maxSubsidy` + a single oracle price
   lookup. They do NOT port: the DB partner lookup (`resolveDiscountPartner`),
   the per-engine SquidRouter conversion-rate adjustment, or post-swap fee
   deduction from the "actual" amount. `actualOutputAmountDecimal` = the
   actual input amount. Subsidy metadata shape mirrors the existing
   `QuoteContext.subsidy` field.
2. **`computeFees` network fee = `"0"`.** `calculateFeeComponents` (reused
   from `core/quote-fees.ts`) returns no network component — the Squid
   network fee is normally added mid-pipeline by per-engine `compute`
   (which needs `ctx.mykoboMint` etc., not available on `PhaseCtx` at
   pre-`simulate` time). The adapter sets `network: "0"` in both fee views
   rather than re-fetching the Squid fee.
3. **`MorphoMint` hardcodes `"usdc-arbitrum"` vault.** Only one vault is
   configured in `morpho-vault-config.ts`; `PhaseCtx` / `CreateQuoteRequest`
   carries no vault-id field. A multi-vault resolution (chain→vault-id map
   or a `ctx.request` field) is deferred. When the base-vault flow runs,
   `previewDeposit` would be read on Base against an Arbitrum vault
   address — no Base vault configured yet.
4. **`NablaSwap` SELL deductible = `0`.** The SELL path in the existing
   engine reads `ctx.preNabla?.deductibleFeeAmountInSwapCurrency`, which
   is not on `PhaseCtx`. Hardcoded to `0` (safe for the POC:
   `EUR_ONRAMP_MORPHO` is BUY/onramp, where the deductible is `0` anyway).
5. **`NablaSwap` runtime is Base-only.** `calculateNablaSwapOutputEvm`
   hardcodes `Networks.Base` in its `EvmClientManager.readContractWithRetry`
   call. The `chain` arg is used only for branding/IO output. NablaSwap is
   only ever instantiated with `chain = Networks.Base` in the POC flow.
6. **`PartnerInfo` import source.** Not exported from `@vortexfi/shared`;
   `core/types.ts` imports it from `../../core/types` (read-only, no file
   outside `core/` was modified).
7. **Smoke test mock leakage.** `mock.module("../../../priceFeed.service", ...)`
   does not fully intercept the real module — the real
   `PriceFeedService initialized` log still appears. Harmless:
   `getOnchainOraclePrice` is wrapped in `try/catch` inside `NablaSwap` and
   the subsidy phases, so the flow completes regardless.

### Appendix: the existing code this refactor targets

The entanglement this POC begins to unwind:

- **Quote side** (`apps/api/src/api/services/quote/`): `QuoteService` →
  `RouteResolver` → `QuoteOrchestrator` walks `stages: StageKey[]` (10
  keys) calling `engine.execute(ctx)`. 10 strategies in
  `routes/strategies/`. Engines in
  `engines/{initialize,nabla-swap,squidrouter,fee,discount,finalize,...}/`.
- **Execution side** (`apps/api/src/api/services/phases/` +
  `transactions/`): `PhaseProcessor` walks
  `state.state.phaseFlow: RampPhase[]` (28 distinct strings). Handlers in
  `handlers/*.ts` read `quote.metadata.*` by string key. Route-prep in
  `transactions/{onramp,offramp}/routes/*.ts` picks both the `phaseFlow`
  array AND builds `unsignedTxs` from the same metadata.
- **The gap:** 10 quote stages ≠ 28 execution phases. The mapping is
  implicit, spread across three files. `QuoteContext` is a ~25-field
  optional bag. `phaseFlow` is `string[]` — a typo fails only at runtime.
  Subsidy logic is smeared across both pipelines. No compile-time
  guarantee that a Polygon-only phase doesn't follow a Base swap.

This POC proves the block model closes that gap, one corridor at a time,
without a big-bang rewrite.

### Roadmap (next steps, in priority order)

1. **Port the remaining ~9 corridors.** Each is now small — primitives
   exist. Apply the same `FlowBuilder.start(...).pipe(...).build()`
   pattern. Candidates by complexity: `EUR_ONRAMP_BASE_DIRECT` (smallest),
   `BRL_ONRAMP_*`, `ALFREDPAY_*`, the offramps. Each port replaces one
   entry in `ramp-flow-definitions.ts` with a derived array.
2. **Wire the new flow into `QuoteService` behind a flag.** Run real
   parity vs the old `onrampMykoboToEvmStrategy` for `EUR_ONRAMP_MORPHO`.
   Compare `outputAmount` numerically.
3. **Implement `prepareTxs` and `execute` on `Phase`.** Currently only
   `simulate` + `phases` are defined. Adding
   `prepareTxs(input, output, ctx): Promise<UnsignedTx[]>` and
   `execute(state, io): Promise<RampState>` to the `Phase` interface makes
   the execution side block-defined too — one source of truth per corridor
   instead of three (strategy, `RampPhase[]`, route-prep).
4. **Full numerical parity integration test** vs
   `onrampMykoboToEvmStrategy` (real externals, no mocks) as a follow-up
   to the smoke test.
5. **Close the POC gaps** in priority order: (a) `computeFees` network
   fee (move the Squid fee fetch into a dedicated phase or a post-`simulate`
   fixup), (b) `MorphoMint` multi-vault resolution, (c) `NablaSwap` SELL
   deductible, (d) `Subsidize*` full partner-DB lookup.
6. **Delete the old strategy + `ramp-flow-definitions.ts` entries** for
   each ported corridor once parity is proven. The old `StageKey` /
   `RampPhase` strings can coexist as aliases during migration.
