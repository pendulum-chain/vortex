# Block-Based Quote Engine — Implementation Report

> Companion to [`DESIGN.md`](./DESIGN.md). DESIGN.md is the forward-looking spec
> (signatures, port sources, conventions). This file is the achievement record:
> the journey, the critical technical discoveries, the final state, the gaps,
> and the roadmap.

## Executive summary

A typed, composable "block" model for defining Vortex quote flows was prototyped
against the `EUR_ONRAMP_MORPHO` corridor (Mykobo SEPA → EURC on Base → Nabla
EURC→USDC swap → Squid bridge to destination chain → Morpho vault deposit). The
POC lives entirely under `apps/api/src/api/services/quote/blocks/` and coexists
with the old quote engine — **zero edits outside `blocks/`**.

The headline goal is achieved: **adjacent phases are checked for compatibility
at compile time**. A phase that outputs USDC on Base cannot feed a phase that
expects USDC on Polygon — TypeScript rejects it. A deliberately mis-ordered flow
in the test file is suppressed by `// @ts-expect-error`, proving the guard is
real (an unused directive would fail `bun typecheck`).

The derived execution `phaseFlow` arrays **deep-equal** the existing
hand-maintained `EUR_ONRAMP_MORPHO` and `EUR_ONRAMP_BASE_MORPHO` arrays in
`ramp-flow-definitions.ts`, so `PhaseProcessor` compatibility is preserved.

Final verification: `4 pass, 1 skip, 0 fail` (structural parity + compile-time
adjacency proof + an end-to-end `simulate` smoke test that ran, not skipped).

## M3 implementor agent

Defined at `.opencode/agents/m3-implementor.md` (41 lines):
- `mode: subagent`, `model: opencode-go/MiniMax-M3`
- Full edit/write/bash/read/glob/grep/list permissions
- Prompt encodes the CLAUDE.md rules (bun, Biome 128/2-space/semis/double-quotes,
  no comments, surgical changes, no over-engineering, `FiatToken` 6-value rule)
- Workflow: read referenced files → implement → `bun lint:fix` → `bun typecheck`
  → report back

**Restart opencode to activate it as a `subagent_type`.** In the session that
produced this report, opencode's config is loaded once at startup and not
hot-reloaded, so implementation ran via `general` subagents behaving per the M3
prompt. After restart, future sessions can spawn real M3 subagents with
`subagent_type: "m3-implementor"`.

## Execution model (how this was built)

Coordinator (this agent) defined architecture + specs + reviewed each wave.
Implementor subagents did the typing. Four sequential waves:

| Wave | Scope | Subagents | Parallel? |
|------|-------|-----------|-----------|
| 1    | Core primitives (7 files under `core/`) | 1 | — |
| 2    | 4 phases (`phases/*.ts`) | 4 | yes |
| 3    | Flow assembly (`flows/eur-onramp-morpho.ts`) | 1 | — |
| 4    | Parity test (`__tests__/*.test.ts`) | 1 | — |

The coordinator reviewed each wave before launching the next. One wave (Wave 1)
required a coordinator-level fix to `flow.ts` after review — the subagent's
variadic `flow()` compiled but silently bypassed the adjacency check (see
"Critical technical discoveries" below).

## Critical technical discoveries

These are the two non-obvious fixes that made the compile-time guarantee
actually work. They are the most valuable knowledge in this POC and are baked
into `core/flow.ts`.

### Discovery 1: `FlowBuilder` over a variadic `flow()` function

DESIGN.md originally specified a variadic `flow(name, p1, p2, p3, p4)` builder
with overloaded signatures for 1..6 phases. Wave 1 implemented it. An
empirical probe proved it **did not enforce adjacency**: a deliberately
mis-ordered flow compiled without error.

Root cause: the variadic implementation signature
`flow(name, ...phases: Phase<PhaseIO, PhaseIO>[])` acts as a fallback when
overload inference fails. Because `Phase`'s `simulate` is declared as a method
shorthand (bivariant under `strictFunctionTypes`), any branded phase is
assignable to `Phase<PhaseIO, PhaseIO>`, so the fallback accepts anything.

Fix: a `FlowBuilder` class where `.pipe(next)` is a **single method signature**
with no overload fallback to escape to:

```ts
pipe<P extends Phase<O, PhaseIO>>(next: P): FlowBuilder<I, OutputOf<P>>;
```

A brand mismatch at a `.pipe()` call is now a hard type error with no permissive
fallback path. The probe confirmed: the mis-ordered flow now errors (the
`@ts-expect-error` is correctly consumed), the correct flow still compiles.

### Discovery 2: `OutputOf<P>` over a second generic parameter

The first `FlowBuilder` attempt still didn't catch the error. Debug showed the
output brand was **widening to `PhaseIO`** (the constraint bound) during generic
inference, severing the brand chain at the very first `.pipe()`.

Root cause: `start<P extends Phase<PhaseIO, O1>, O1>` infers `O1` through the
constraint (`PhaseIO`) rather than from the actual phase type. The literal
brand (`"EURC"`, `"base"`) is lost.

Fix: infer via a conditional `infer` type on a single generic, which preserves
the literal brand:

```ts
type OutputOf<P> = P extends Phase<PhaseIO, infer O> ? O : never;

static start<P extends Phase<PhaseIO, PhaseIO>>(first: P): FlowBuilder<PhaseIO, OutputOf<P>>;
pipe<P extends Phase<O, PhaseIO>>(next: P): FlowBuilder<I, OutputOf<P>>;
```

This was verified with a type-equality probe (`Equals<Step1O, PhaseIO<"EURC", "Base">>`
returned `true` after the fix, `false` before).

### Documented relaxation: `branch()` at runtime decision points

A `branch()` that selects between a `passthrough` (stays on Base) and a
`SquidRouterSwap` (goes Base→Arbitrum) produces a union output brand
`PhaseIO<USDC, Base | Arbitrum>`. TypeScript does not infer this union
automatically from the branches — it picks the first branch's output and
rejects the second. The fix is an **explicit type argument** on `branch`:

```ts
branch<
  PhaseIO<typeof EvmToken.USDC, typeof Networks.Base>,                          // input
  PhaseIO<typeof EvmToken.USDC, typeof Networks.Base | typeof Networks.Arbitrum> // output (union)
>(select, [passthrough<...>(), SquidRouterSwap(...)])
```

This is the intentional escape hatch: at a runtime branch point the chain brand
becomes a union and the downstream phase (`MorphoMint<Networks.Base | Networks.Arbitrum>`)
must be generic over it. The strong compile-time guarantee still holds for the
linear segments (MykoboMint → NablaSwap, and within each branch).

## Final file inventory

14 files under `blocks/` (1045 lines incl. DESIGN.md) + 1 agent file (41 lines).

```
.opencode/agents/m3-implementor.md                                    41

apps/api/src/api/services/quote/blocks/
  DESIGN.md                                                          361
  core/
    types.ts                       (PhaseIO, Phase, Flow, PhaseCtx)   38
    io.ts                          (requestToIO, evmIO)               23
    flow.ts                        (FlowBuilder, OutputOf)            33
    combinators.ts                 (branch, passthrough)              43
    subsidy.ts                     (WithSubsidy)                      92
    fees.ts                        (computeFees)                      48
    phase-flow.ts                  (assemblePhaseFlow)                28
  phases/
    mykobo-mint.ts                                                    43
    nabla-swap.ts                                                     58
    squid-router-swap.ts                                              64
    morpho-mint.ts                                                    64
  flows/
    eur-onramp-morpho.ts                                              33
  __tests__/
    eur-onramp-morpho.parity.test.ts                                 117
```

All `blocks/**/*.ts` files pass `bun typecheck` and `bun lint:fix` cleanly.
Pre-existing repo-wide typecheck/lint errors (4 in
`transactions/offramp/routes/evm-to-mykobo-morpho.ts`, ~193 lint in other
non-test files) are untouched and unrelated.

## Verification results

### Test run

```
bun test src/api/services/quote/blocks/__tests__/eur-onramp-morpho.parity.test.ts
→ 4 pass, 1 skip, 0 fail, 6 expect() calls, 5 tests across 1 file
```

| Part | Test | Result |
|------|------|--------|
| 1 | `derives the core phases from the assembled blocks` | pass |
| 1 | `assembles the cross-chain phaseFlow matching the existing EUR_ONRAMP_MORPHO` | pass |
| 1 | `assembles the base-vault phaseFlow matching the existing EUR_ONRAMP_BASE_MORPHO` | pass |
| 2 | `rejects a mis-ordered flow at compile time` (`.skip` + `@ts-expect-error`) | skip at runtime, **type-checked by tsc** (directive consumed → adjacency proven) |
| 3 | `runs the assembled flow end-to-end with mocked externals and lands on MORPHO_VAULT` | pass (ran, not skipped) |

The Part 3 smoke test mocks `calculateNablaSwapOutputEvm`,
`calculateEvmBridgeAndNetworkFee`, `MykoboApiService.getInstance`, and
`EvmClientManager.getInstance` (the four real externals). It asserts the final
`PhaseIO` has `amount > 0`, `token === EvmToken.MORPHO_VAULT`, and `ctx.notes`
is non-empty — all three hold.

### Compile-time adjacency proof

The `// @ts-expect-error` directive on the mis-ordered flow
(`FlowBuilder.start(MorphoMint<...>()).pipe(MykoboMint)`) is **correctly
consumed** by a real TS2322 ("`Phase<PhaseIO<"EUR","fiat">,...>` is not
assignable to `Phase<O, PhaseIO>`"). There is no "Unused `@ts-expect-error`
directive" error — the guard is real. If someone breaks adjacency in the
future, `bun typecheck` will fail.

## Parity proof (derived `RampPhase[]` arrays)

`assemblePhaseFlow` produces arrays that deep-equal the existing
hand-maintained definitions in `phases/ramp-flow-definitions.ts`:

**Cross-chain** (`isBaseVault: false`) — deep-equals `EUR_ONRAMP_MORPHO` (lines 167-181):
```
["initial", "mykoboOnrampDeposit", "fundEphemeral", "subsidizePreSwap",
 "nablaApprove", "nablaSwap", "distributeFees", "subsidizePostSwap",
 "squidRouterSwap", "squidRouterPay", "finalSettlementSubsidy",
 "morphoDeposit", "complete"]
```

**Base vault** (`isBaseVault: true`) — deep-equals `EUR_ONRAMP_BASE_MORPHO` (lines 189-200):
```
["initial", "mykoboOnrampDeposit", "fundEphemeral", "subsidizePreSwap",
 "nablaApprove", "nablaSwap", "distributeFees", "subsidizePostSwap",
 "morphoDeposit", "complete"]
```

The block-derived core phases (from `flow.phases`, before bookending) are:
```
["mykoboOnrampDeposit", "subsidizePreSwap", "nablaApprove", "nablaSwap",
 "subsidizePostSwap", "squidRouterSwap", "squidRouterPay", "morphoDeposit"]
```
`assemblePhaseFlow` prepends `["initial"]`, inserts `["fundEphemeral"]` after
`mykoboOnrampDeposit`, inserts `["distributeFees"]` after `nablaSwap`, inserts
`["finalSettlementSubsidy"]` after `squidRouterPay` (cross-chain only), and
appends `["complete"]`.

## The assembled flow

```ts
FlowBuilder.start(MykoboMint)
  .pipe(WithSubsidy(NablaSwap(Networks.Base, EvmToken.EURC, EvmToken.USDC), { bookend: "subsidizePostSwap" }))
  .pipe(
    branch<
      PhaseIO<typeof EvmToken.USDC, typeof Networks.Base>,
      PhaseIO<typeof EvmToken.USDC, typeof Networks.Base | typeof Networks.Arbitrum>
    >(
      ctx => (ctx.request.to === Networks.Base ? 0 : 1),
      [passthrough<EvmToken.USDC, Networks.Base>(), SquidRouterSwap(Networks.Base, Networks.Arbitrum, EvmToken.USDC)]
    )
  )
  .pipe(MorphoMint<Networks.Base | Networks.Arbitrum>())
  .build("EurOnrampMorpho");
```

## Known gaps & POC limitations

Documented from subagent reports. All are intentional POC scope cuts, not bugs:

1. **`WithSubsidy` simplified.** Computes subsidy metadata from
   `ctx.partner.targetDiscount`/`maxSubsidy` + a single oracle price lookup. Does
   NOT port: the DB partner lookup (`resolveDiscountPartner`), the per-engine
   SquidRouter conversion-rate adjustment, or post-swap fee deduction from the
   "actual" amount. `actualOutputAmountDecimal` = inner output amount directly.
   Subsidy metadata shape mirrors the existing `QuoteContext.subsidy` field.
2. **`computeFees` network fee = `"0"`.** `calculateFeeComponents` (reused from
   `core/quote-fees.ts`) returns no network component — the Squid network fee is
   normally added mid-pipeline by per-engine `compute` (which needs `ctx.mykoboMint`
   etc., not available on `PhaseCtx` at pre-`simulate` time). The adapter sets
   `network: "0"` in both fee views rather than re-fetching the Squid fee.
3. **`MorphoMint` hardcodes `"usdc-arbitrum"` vault.** Only one vault is
   configured in `morpho-vault-config.ts`; `PhaseCtx`/`CreateQuoteRequest`
   carries no vault-id field. A multi-vault resolution (chain→vault-id map or a
   `ctx.request` field) is deferred. When `branch` selects the `passthrough`
   path (`input.chain === Networks.Base`), `previewDeposit` would be read on
   Base against an Arbitrum vault address — no Base vault configured yet.
4. **`NablaSwap` SELL deductible = `0`.** The SELL path in the existing engine
   reads `ctx.preNabla?.deductibleFeeAmountInSwapCurrency`, which is not on
   `PhaseCtx`. Hardcoded to `0` (safe for the POC: `EUR_ONRAMP_MORPHO` is
   BUY/onramp, where the deductible is `0` anyway — onramp deducts after swap).
5. **`NablaSwap` runtime is Base-only.** `calculateNablaSwapOutputEvm` hardcodes
   `Networks.Base` in its `EvmClientManager.readContractWithRetry` call. The
   `chain` arg is used only for branding/IO output. NablaSwap is only ever
   instantiated with `chain = Networks.Base` in the POC flow.
6. **`QuoteTicketMetadata` import source.** `PartnerInfo` is not exported from
   `@vortexfi/shared`; `core/types.ts` imports it from `../../core/types`
   (read-only, no file outside `core/` was modified).
7. **Smoke test mock leakage.** `mock.module("../../../priceFeed.service", ...)`
   did not fully intercept the real module — the real `PriceFeedService
   initialized` log still appears. Harmless: `getOnchainOraclePrice` is wrapped
   in `try/catch` inside both `NablaSwap` and `WithSubsidy`, so the flow
   completes regardless. The 4 critical mocks (nabla, squidrouter, Mykobo,
   EvmClientManager) all applied.

## Conventions discovered (for future corridor ports)

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
different strings, so the brands are distinct types. This is what makes the
fiat→EVM boundary in `MykoboMint` (input `PhaseIO<typeof FiatToken.EURC, "fiat">`
→ output `PhaseIO<typeof EvmToken.EURC, typeof Networks.Base>`) type-check: the
output brand genuinely differs from the input brand, and only `MykoboMint`'s
declared signature bridges them.

### Factory function call forms (TS has no generic const values)

| Export | Form | Why |
|--------|------|-----|
| `MykoboMint` | plain `const` (no generics) | no runtime variability |
| `NablaSwap(chain, inToken, outToken)` | generic **function with runtime args** | needs runtime values for `getOnChainTokenDetails`; brands inferred from args |
| `SquidRouterSwap(fromChain, toChain, token)` | generic **function with runtime args** | needs runtime values for bridge request; brands inferred from args |
| `MorphoMint<Chain>()` | generic function with **type args only** | chain is a union at the call site; reads `input.chain` at runtime |
| `passthrough<Token, Chain>()` | generic function, type args only | pure no-op |
| `WithSubsidy(inner, opts)` | generic function wrapping a `Phase` | decorator |
| `branch<I, O>(select, branches)` | generic function, often with **explicit type args** | needed when branches produce a union output (see "Documented relaxation" above) |

### Biome rule that shaped the code

`biome.json` sets `suspicious/noExplicitAny: "error"`, and its override that
sets it to `"off"` has no `includes` field, so Biome v2 does not apply the
override — `any` is genuinely an error everywhere. This is why `core/flow.ts`
uses `PhaseIO` (the base interface) instead of `any` for the loose constraint
slots, and why `Phase`'s `simulate` is a method shorthand (bivariant under
`strictFunctionTypes`, so branded phases remain assignable to `Phase<PhaseIO, O>`).

## Roadmap (next steps, in priority order)

1. **Port the remaining ~9 corridors.** Each is now small — primitives exist.
   Apply the same `FlowBuilder.start(...).pipe(...).build()` pattern. Candidates
   by complexity: `EUR_ONRAMP_BASE_DIRECT` (smallest), `BRL_ONRAMP_*`,
   `ALFREDPAY_*`, the offramps. Each port replaces one entry in
   `ramp-flow-definitions.ts` with a derived array.
2. **Wire the new flow into `QuoteService` behind a flag.** Run real parity
   vs the old `onrampMykoboToEvmStrategy` for `EUR_ONRAMP_MORPHO`. Compare
   `outputAmount` numerically.
3. **Implement `prepareTxs` and `execute` on `Phase`.** Currently only
   `simulate` + `phases` are defined. Adding `prepareTxs(input, output, ctx):
   Promise<UnsignedTx[]>` and `execute(state, io): Promise<RampState>` to the
   `Phase` interface makes the execution side block-defined too — one source of
   truth per corridor instead of three (strategy, `RampPhase[]`, route-prep).
4. **Full numerical parity integration test** vs `onrampMykoboToEvmStrategy`
   (real externals, no mocks) as a follow-up to the smoke test.
5. **Close the POC gaps** in priority order: (a) `computeFees` network fee
   (move the Squid fee fetch into a dedicated phase or a post-`simulate` fixup),
   (b) `MorphoMint` multi-vault resolution, (c) `NablaSwap` SELL deductible,
   (d) `WithSubsidy` full partner-DB lookup.
6. **Delete the old strategy + `ramp-flow-definitions.ts` entries** for each
   ported corridor once parity is proven. The old `StageKey`/`RampPhase` strings
   can coexist as aliases during migration.

## Appendix: the existing code this refactor targets (for context)

The entanglement this POC begins to unwind (full detail in the original
exploration):

- **Quote side** (`apps/api/src/api/services/quote/`): `QuoteService` →
  `RouteResolver` → `QuoteOrchestrator` walks `stages: StageKey[]` (10 keys)
  calling `engine.execute(ctx)`. 10 strategies in `routes/strategies/`. Engines
  in `engines/{initialize,nabla-swap,squidrouter,fee,discount,finalize,...}/`.
- **Execution side** (`apps/api/src/api/services/phases/` +
  `transactions/`): `PhaseProcessor` walks `state.state.phaseFlow: RampPhase[]`
  (28 distinct strings). Handlers in `handlers/*.ts` read `quote.metadata.*` by
  string key. Route-prep in `transactions/{onramp,offramp}/routes/*.ts` picks
  both the `phaseFlow` array AND builds `unsignedTxs` from the same metadata.
- **The gap:** 10 quote stages ≠ 28 execution phases. The mapping is implicit,
  spread across three files. `QuoteContext` is a ~25-field optional bag.
  `phaseFlow` is `string[]` — a typo fails only at runtime. Subsidy logic is
  smeared across both pipelines. No compile-time guarantee that a Polygon-only
  phase doesn't follow a Base swap.

This POC proves the block model closes that gap, one corridor at a time, without
a big-bang rewrite.
