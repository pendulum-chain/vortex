# Block-Based Quote Engine — Proof of Concept

## Goal

Introduce a typed, composable "block" model for defining quote flows. Each phase
declares its input/output IO brands (token + chain), and the `flow()` builder
enforces **at compile time** that adjacent phases are compatible — a Base swap
cannot feed a Polygon-only transfer, a Morpho deposit on Arbitrum cannot follow a
passthrough that stayed on Base.

**Scope of this POC:** the `EUR_ONRAMP_MORPHO` corridor
(Mykobo SEPA → EURC on Base → Nabla EURC→USDC swap → Squid bridge to dest chain →
Morpho vault deposit). The old strategy (`onrampMykoboToEvmStrategy` + morpho
route-prep) and all existing phase handlers **coexist** and are NOT modified.
The POC lives entirely under `blocks/` and is verified by a parity test.

## File structure

```
apps/api/src/api/services/quote/blocks/
  DESIGN.md                              # this file
  core/
    types.ts                             # PhaseIO, Phase, Flow, PhaseCtx
    io.ts                                # IO helpers + brand type aliases + requestToIO
    flow.ts                              # flow() builder with compile-time adjacency
    combinators.ts                       # branch(), passthrough()
    subsidy.ts                           # WithSubsidy wrapper
    phase-flow.ts                        # derive RampPhase[] from a Flow (+ infra bookends)
    fees.ts                              # computeFees(ctx) helper (ports quote-fees.ts)
  phases/
    mykobo-mint.ts                       # MykoboMint: fiat EUR -> EURC on Base
    nabla-swap.ts                        # NablaSwap<Chain, InToken, OutToken>
    squid-router-swap.ts                 # SquidRouterSwap<FromChain, ToChain, Token>
    morpho-mint.ts                       # MorphoMint<Chain>: USDC -> MORPHO_VAULT
  flows/
    eur-onramp-morpho.ts                 # the assembled flow
  __tests__/
    eur-onramp-morpho.parity.test.ts     # structural + parity verification
```

## Core types (`core/types.ts`)

```ts
import type { Big } from "big.js";
import type {
  CreateQuoteRequest,
  PartnerInfo,
  QuoteFeeStructure,
  RampPhase,
  RampCurrency
} from "@vortexfi/shared";

// Compile-time brand unions. Concrete phases instantiate PhaseIO with literal
// types drawn from EvmToken | FiatToken | AssetHubToken | PendulumCurrencyId
// (for Token) and Networks | "Pendulum" | "Stellar" | "fiat" (for Chain).
// Keep these as `extends string` so literal narrowing flows through generics.
export type TokenBrand = string;
export type ChainBrand = string;

export interface PhaseIO<Token extends TokenBrand = TokenBrand, Chain extends ChainBrand = ChainBrand> {
  amount: Big;                       // human-readable decimal amount
  amountRaw: string;                 // integer-string raw amount at the token's decimals
  token: Token;
  chain: Chain;
  meta: Record<string, unknown>;     // phase-specific (route id, oracle price, subsidy, ...)
}

// Cross-phase context: the genuinely shared state that is NOT the per-phase IO.
// Replaces the cross-phase parts of the current QuoteContext (request, partner,
// fees, notes). Per-phase computed values travel on the PhaseIO.meta, not here.
export interface PhaseCtx {
  request: CreateQuoteRequest & { userId?: string };
  partner: PartnerInfo | null;
  now: Date;
  notes: string[];
  addNote(note: string): void;
  // Computed once by the flow runner via computeFees(ctx) before phases run.
  fees?: {
    usd?: { vortex: string; anchor: string; partnerMarkup: string; network: string; total: string };
    displayFiat?: QuoteFeeStructure;
  };
  // Set by the MykoboMint phase so WithSubsidy can read the pre-swap amount.
  // (Keep this minimal; prefer carrying values on PhaseIO.meta.)
}

// A block. Generic over Input and Output IO brands so adjacency is checkable.
export interface Phase<I extends PhaseIO, O extends PhaseIO> {
  readonly name: string;
  // The RampPhase(s) this block expands to in the execution phaseFlow.
  // Example: NablaSwap -> ["nablaApprove", "nablaSwap"].
  readonly phases: RampPhase[];
  simulate(input: I, ctx: PhaseCtx): Promise<O>;
}

export interface Flow {
  readonly name: string;
  // Derived: flatMap(p => p.phases) over the assembled phases.
  readonly phases: RampPhase[];
  // Runs the chain end to end. The first phase's input is built by requestToIO(ctx).
  simulate(ctx: PhaseCtx): Promise<PhaseIO>;
}
```

## `FlowBuilder` (`core/flow.ts`)

Compile-time adjacency is enforced via a **builder**, not a variadic `flow()`
function. A variadic impl signature (`Phase<PhaseIO, PhaseIO>[]`) acts as a
fallback that bivariance makes permissive, silently bypassing the adjacency
check (verified empirically). The builder's `.pipe(next)` is a single method
signature with no overload fallback, so a brand mismatch is a hard type error.

A second critical detail: the output brand must be extracted via a conditional
`infer` type, **not** a second generic param. `start<P extends Phase<PhaseIO,
O1>, O1>` widens `O1` to `PhaseIO` (the constraint bound) during inference,
severing the brand chain. `OutputOf<P>` preserves the literal brand.

```ts
type OutputOf<P> = P extends Phase<PhaseIO, infer O> ? O : never;

export class FlowBuilder<I extends PhaseIO, O extends PhaseIO> {
  private constructor(private readonly phaseList: Phase<PhaseIO, PhaseIO>[]) {}

  static start<P extends Phase<PhaseIO, PhaseIO>>(first: P): FlowBuilder<PhaseIO, OutputOf<P>>;
  pipe<P extends Phase<O, PhaseIO>>(next: P): FlowBuilder<I, OutputOf<P>>;
  build(name: string): Flow;
}
```

Runtime: `build()` stores the phases array; `Flow.simulate(ctx)` builds the
first input via `requestToIO(ctx)`, then sequentially calls
`phase.simulate(prevOutput, ctx)`, returning the final output.
`Flow.phases` = `phaseList.flatMap(p => p.phases)`.

Usage: `FlowBuilder.start(phase1).pipe(phase2).pipe(phase3).build("name")`.

## `branch()` and `passthrough()` (`core/combinators.ts`)

```ts
// branch: runtime-selects between phases based on ctx. The output type O is
// declared explicitly (the common downstream shape); each branch's Phase<I, O>
// must produce IO assignable to O. This is the documented escape hatch where
// compile-time adjacency is intentionally relaxed at a runtime decision point.
export function branch<I extends PhaseIO, O extends PhaseIO>(
  select: (ctx: PhaseCtx) => Promise<number> | number,
  branches: Phase<I, O>[]
): Phase<I, O>;

// passthrough: a no-op phase that forwards input as output (same token, same chain).
// Used when a bridge is skipped because funds are already on the target chain.
// phases: [] (no execution phases — it is a quote-side no-op).
export function passthrough<Token extends TokenBrand, Chain extends ChainBrand>(): Phase<PhaseIO<Token, Chain>, PhaseIO<Token, Chain>>;
```

`branch`'s `phases` = the union (deduped, order-preserved) of all branches' phases.
For the EUR_ONRAMP_MORPHO flow, branches are `passthrough` (phases: []) and
`SquidRouterSwap` (phases: `["squidRouterSwap", "squidRouterPay"]`), so the
branch contributes `["squidRouterSwap", "squidRouterPay"]` to the derived
phaseFlow. `assemblePhaseFlow` (below) handles the conditional inclusion at
runtime — for the static `flow.phases` derivation, include the union.

## `WithSubsidy` wrapper (`core/subsidy.ts`)

```ts
export function WithSubsidy<P extends Phase<I, O>, I extends PhaseIO, O extends PhaseIO>(
  inner: P,
  opts: { bookend: "subsidizePostSwap" | "finalSettlementSubsidy" }
): Phase<I, O>;
```

- `name`: `WithSubsidy(${inner.name})`
- `phases`: `["subsidizePreSwap", ...inner.phases, opts.bookend]`
- `simulate()`: runs `inner.simulate(input, ctx)`, then computes subsidy metadata
  and attaches it to `output.meta.subsidy`. Port the calculation from
  `engines/discount/onramp.ts` and `engines/merge-subsidy/offramp-evm.ts`. The
  metadata shape mirrors the current `QuoteContext.subsidy` field
  (`core/types.ts:245-261` of the existing quote engine):
  ```ts
  meta.subsidy = {
    applied: boolean;
    subsidyRate: Big;
    partnerId: string | null;
    expectedOutputAmountDecimal: Big;
    actualOutputAmountDecimal: Big;
    subsidyAmountInOutputTokenDecimal: Big;
    idealSubsidyAmountInOutputTokenDecimal: Big;
    targetOutputAmountDecimal: Big;
    // ...raw string counterparts
  }
  ```

## IO helpers (`core/io.ts`)

```ts
// Build the first phase's input IO from the quote request.
export function requestToIO(ctx: PhaseCtx): PhaseIO< RampCurrency, "fiat">;

// Convenience constructors for typed EVM / Pendulum IO.
export function evmIO<Token extends TokenBrand, Chain extends ChainBrand>(
  token: Token, chain: Chain, amount: Big, amountRaw: string, meta?: Record<string, unknown>
): PhaseIO<Token, Chain>;
```

## Fees helper (`core/fees.ts`)

```ts
// Ports calculateFeeComponents from core/quote-fees.ts. Called once by the flow
// runner before simulate() so ctx.fees is populated for WithSubsidy and phases.
export async function computeFees(ctx: PhaseCtx): Promise<void>;
```

## Phase implementations (`phases/*.ts`)

Each phase ports the `compute()` logic of an existing engine, returning a typed
`PhaseIO` instead of mutating `QuoteContext`. Read the listed existing files
first and mimic their computation exactly (same external calls, same math) so
the parity test can pass.

### `mykobo-mint.ts` — `MykoboMint`
- Type: `Phase<PhaseIO<"EUR", "fiat">, PhaseIO<typeof FiatToken.EURC, typeof Networks.Base>>`
  (use the actual `FiatToken.EURC` and `Networks.Base` literal values)
- Port from: `engines/initialize/onramp-mykobo.ts`
  - Call `MykoboApiService.getInstance().defaultDepositFee(inputAmountDecimal.toFixed(2, 0))`
  - `deliveredEurc = inputAmount - mykoboFee`
  - Use `getOnChainTokenDetails(Networks.Base, EvmToken.EURC)` for decimals/raw conversion
- `phases`: `["mykoboOnrampDeposit"]`
- Output meta: `{ mykoboFee, inputAmountRaw, outputAmountRaw }`

### `nabla-swap.ts` — `NablaSwap<Chain, InToken, OutToken>`
- Type: `Phase<PhaseIO<InToken, Chain>, PhaseIO<OutToken, Chain>>` with `Chain`, `InToken`, `OutToken` as generics
- Port from: `engines/nabla-swap/base-evm.ts` + `core/nabla.ts:calculateNablaSwapOutputEvm`
  - Subtract deductible fee (for offramp only; onramp returns 0) — see `BaseNablaSwapEngineEvm.getDeductibleFeeAmount`
  - Call `calculateNablaSwapOutputEvm({ inputAmountForSwap, inputTokenDetails, outputTokenDetails, rampType })`
  - Optionally fetch oracle price via `priceFeedService.getOnchainOraclePrice`
- `phases`: `["nablaApprove", "nablaSwap"]`
- Output meta: `{ effectiveExchangeRate, oraclePrice, inputAmountForSwapRaw, inputToken, outputToken }`
- Instantiate for the flow as `NablaSwap<typeof Networks.Base, typeof EvmToken.EURC, typeof EvmToken.USDC>`

### `squid-router-swap.ts` — `SquidRouterSwap<FromChain, ToChain, Token>`
- Type: `Phase<PhaseIO<Token, FromChain>, PhaseIO<Token, ToChain>>`
- Port from: `engines/squidrouter/onramp-base-to-evm.ts` + `core/squidrouter.ts:calculateEvmBridgeAndNetworkFee`
  - Build `EvmBridgeRequest` from input IO + ctx.request
  - Call `calculateEvmBridgeAndNetworkFee(request)`
  - Deduct distributed USD fees from the bridged amount (see `OnRampSquidRouterToBaseEngine.compute` lines 101-107)
  - Use `getBridgeTargetTokenDetails` for the destination token (handles MORPHO_VAULT -> USDC)
- `phases`: `["squidRouterSwap", "squidRouterPay"]`
- Output meta: `{ effectiveExchangeRate, networkFeeUSD, routeData, fromToken, toToken }`

### `morpho-mint.ts` — `MorphoMint<Chain>`
- Type: `Phase<PhaseIO<typeof EvmToken.USDC, Chain>, PhaseIO<typeof EvmToken.MORPHO_VAULT, Chain>>`
- Port from: `handlers/morpho-deposit-handler.ts` (the deposit/previewDeposit pattern) and
  `engines/initialize/offramp-from-evm-morpho.ts` (the previewRedeem pattern — mirror it for previewDeposit)
  - For `simulate()`: call the vault's `previewDeposit(assets)` read to convert USDC -> expected shares
  - Use the Morpho vault ABI snippet already present in `morpho-deposit-handler.ts` and `morpho-vault-config.ts`
  - The vault address comes from `ctx.request` / morpho config; read `handlers/morpho-vault-config.ts`
- `phases`: `["morphoDeposit"]`
- Output meta: `{ vaultAddress, sharesAmountRaw, expectedUsdcRaw }`
- `Chain` is generic so the same block handles Base and Arbitrum vaults; narrow at runtime on `input.chain`.

## EUR_ONRAMP_MORPHO flow (`flows/eur-onramp-morpho.ts`)

```ts
import { EvmToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { branch, passthrough } from "../core/combinators";
import { WithSubsidy } from "../core/subsidy";
import { MykoboMint } from "../phases/mykobo-mint";
import { NablaSwap } from "../phases/nabla-swap";
import { SquidRouterSwap } from "../phases/squid-router-swap";
import { MorphoMint } from "../phases/morpho-mint";

export const eurOnrampMorphoFlow = FlowBuilder
  .start(MykoboMint)
  .pipe(WithSubsidy(NablaSwap(Networks.Base, EvmToken.EURC, EvmToken.USDC), { bookend: "subsidizePostSwap" }))
  .pipe(
    branch(
      ctx => (ctx.request.to === Networks.Base ? 0 : 1),
      [passthrough<EvmToken.USDC, Networks.Base>(), SquidRouterSwap(Networks.Base, Networks.Arbitrum, EvmToken.USDC)]
    )
  )
  .pipe(MorphoMint<Networks.Base | Networks.Arbitrum>())
  .build("EurOnrampMorpho");
```

**Note on factory functions:**
- `MykoboMint` is a plain `const` (no generics): `Phase<PhaseIO<typeof FiatToken.EURC, "fiat">, PhaseIO<typeof EvmToken.EURC, typeof Networks.Base>>`.
- `NablaSwap(chain, inToken, outToken)` and `SquidRouterSwap(fromChain, toChain, token)` are generic **functions taking runtime args** (the enum member values); brand types are inferred from the args. They need runtime values to call `getOnChainTokenDetails` / build the bridge request.
- `MorphoMint<Chain>()` is a generic function with **type args only** (no runtime chain arg) because the chain is a union (`Networks.Base | Networks.Arbitrum`) at the call site — it reads `input.chain` at runtime instead.
- `passthrough<Token, Chain>()` is type-args only (pure no-op, no runtime logic).
- **Brands are enum member types** (e.g. `EvmToken.EURC`, `Networks.Base`), never plain string literals — keep this consistent so adjacency matches. Key values: `FiatToken.EURC="EUR"`, `EvmToken.EURC="EURC"`, `EvmToken.USDC="USDC"`, `EvmToken.MORPHO_VAULT="MORPHO VAULT"`, `Networks.Base="base"`, `Networks.Arbitrum="arbitrum"`.

The `branch` output type is `PhaseIO<EvmToken.USDC, Networks.Base | Networks.Arbitrum>`.
`MorphoMint` is instantiated with `Chain = Networks.Base | Networks.Arbitrum`.
This is the documented relaxation: at a runtime branch point the chain brand
becomes a union and the downstream phase must be generic over it. The strong
compile-time guarantee still holds for the linear segments (MykoboMint → NablaSwap,
and within each branch).

## Phase-flow derivation (`core/phase-flow.ts`)

```ts
import { RampPhase } from "@vortexfi/shared";
import { Flow } from "./types";

export function assemblePhaseFlow(
  flow: Flow,
  opts: { direction: RampDirection; isBaseVault: boolean }
): RampPhase[];
```

Produce a `RampPhase[]` that deep-equals the existing definitions:
- Cross-chain (`isBaseVault: false`): `EUR_ONRAMP_MORPHO` from `ramp-flow-definitions.ts`
- Base vault (`isBaseVault: true`): `EUR_ONRAMP_BASE_MORPHO`

The block-derived core phases (from `flow.phases`) are:
`["mykoboOnrampDeposit", "subsidizePreSwap", "nablaApprove", "nablaSwap", "subsidizePostSwap", "squidRouterSwap", "squidRouterPay", "morphoDeposit"]`
(cross-chain) or the same without the squid pair (base). `assemblePhaseFlow`
prepends `["initial"]`, inserts `["fundEphemeral"]` after `mykoboOnrampDeposit`,
inserts `["distributeFees"]` after `nablaSwap` (before `subsidizePostSwap`), and
appends `["complete"]`. Compare carefully against the existing arrays in
`ramp-flow-definitions.ts:167-200` to get the exact ordering and bookends.

## Verification (`__tests__/eur-onramp-morpho.parity.test.ts`)

1. **Structural:** `eurOnrampMorphoFlow.phases` equals the expected core phases array.
2. **Phase-flow parity:** `assemblePhaseFlow(eurOnrampMorphoFlow, { isBaseVault: false })`
   deep-equals `EUR_ONRAMP_MORPHO`; the base variant deep-equals `EUR_ONRAMP_BASE_MORPHO`.
3. **Compile-time adjacency (type-level):** include a `// @ts-expect-error` block
   showing a deliberately mis-ordered flow (e.g. `MorphoMint` before `NablaSwap`)
   fails to compile — proving the type guard works.
4. **Simulate smoke test:** with external calls mocked (viem readContract,
   MykoboApiService.defaultDepositFee, Squid getRoute, Morpho previewDeposit),
   `eurOnrampMorphoFlow.simulate(ctx)` returns a `PhaseIO` whose `amount > 0` and
   `token === EvmToken.MORPHO_VAULT`. Full numerical parity vs the old strategy
   is a follow-up integration test (out of POC scope).

## Conventions (non-negotiable)

- `bun`, never npm/yarn/pnpm. Run `bun lint:fix` then `bun typecheck` from repo root.
- Biome: line width 128, 2-space indent, semicolons always, double quotes, no trailing commas.
- DO NOT add comments unless this DESIGN doc explicitly asks. No docstrings on code you didn't touch.
- Surgical changes: touch only files under `blocks/`. Do NOT modify any existing
  file outside `blocks/` (no edits to `quote/core/*`, `engines/*`, `phases/*`,
  `ramp-flow-definitions.ts`, etc.). The POC coexists with the old code.
- No over-engineering: no abstractions for single-use code, no error handling for
  impossible scenarios, no input validation for typed internal params.
- `FiatToken` has 6 values (EURC, ARS, BRL, USD, MXN, COP); any `Record<FiatToken, X>` must include all six.
- Mimic the import style of neighboring files (e.g. `engines/nabla-swap/base-evm.ts`).

## Existing files to read before implementing (per phase)

| Block | Primary port source |
|-------|---------------------|
| MykoboMint | `engines/initialize/onramp-mykobo.ts`, `engines/initialize/index.ts` |
| NablaSwap | `engines/nabla-swap/base-evm.ts`, `engines/nabla-swap/onramp-mykobo-evm.ts`, `core/nabla.ts` |
| SquidRouterSwap | `engines/squidrouter/onramp-base-to-evm.ts`, `engines/squidrouter/index.ts`, `core/squidrouter.ts` |
| MorphoMint | `handlers/morpho-deposit-handler.ts`, `handlers/morpho-vault-config.ts`, `engines/initialize/offramp-from-evm-morpho.ts` |
| WithSubsidy | `engines/discount/onramp.ts`, `engines/merge-subsidy/offramp-evm.ts`, `core/types.ts` (subsidy field) |
| fees | `core/quote-fees.ts`, `core/helpers.ts` |
| phase-flow | `phases/ramp-flow-definitions.ts` (EUR_ONRAMP_MORPHO, EUR_ONRAMP_BASE_MORPHO) |

All paths are relative to `apps/api/src/api/services/quote/` (or `apps/api/src/api/services/` for `phases/` and `handlers/`).
