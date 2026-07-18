# The Flow Type System — a walkthrough

How `FlowBuilder` enforces phase adjacency at compile time. It lives in two
files: `core/types.ts` (the shapes) and `core/flow.ts` (the builder). The key
idea: **all brand-checking happens at composition time inside `FlowBuilder`;
the built `Flow` is deliberately type-erased.**

## 1. The brands are just string literal types

```ts
export type TokenBrand = string;
export type ChainBrand = string;

export interface PhaseIO<Token extends TokenBrand = TokenBrand, Chain extends ChainBrand = ChainBrand> {
  amount: Big;
  amountRaw: string;
  token: Token;
  chain: Chain;
  meta: Record<string, unknown>;
}
```

There is no nominal branding — `PhaseIO<"BRLA", "base">` and
`PhaseIO<"USDC", "base">` are different types simply because their `token`
property types are different literals. The brands are always instantiated
with enum *member* types (`typeof EvmToken.BRLA` = `"BRLA"`), and since
brands are structural, the **chain** brand carries the discrimination when
token strings collide across ecosystems (`EvmToken.USDC` and
`AssetHubToken.USDC` are the same literal `"USDC"`). It is also why the
fiat→EVM boundary type-checks: `FiatToken.BRL` is `"BRL"` but
`EvmToken.BRLA` is `"BRLA"` — genuinely different literals, so only
`AveniaMint`'s declared signature
(`Phase<PhaseIO<"BRL","fiat">, PhaseIO<"BRLA","base">>`) bridges them.

## 2. `Phase.simulate` is a property function — the load-bearing trick

```ts
export interface Phase<I extends PhaseIO, O extends PhaseIO> {
  readonly simulate: (input: I, ctx: PhaseCtx) => Promise<O>; // property, NOT simulate(input, ctx): Promise<O>
  // ...
}
```

Under `strictFunctionTypes`, TypeScript checks **method** parameters
bivariantly (loose, both directions) but **function-typed property**
parameters contravariantly (strict). Had `simulate` been a method,
`Phase<PhaseIO<"BRLA">, …>` would be assignable to
`Phase<PhaseIO<"USDC">, …>` and the whole adjacency check would silently
pass everything. As a property, assignability in the input slot only goes
one way: a phase can be used where a *narrower* input is fed to it, never a
wrong one.

## 3. `pipe` is where adjacency is enforced

```ts
export class FlowBuilder<I extends PhaseIO, O extends PhaseIO> {
  pipe<P extends Phase<O, PhaseIO>>(next: P): FlowBuilder<I, OutputOf<P>>;
}
```

The builder carries two type parameters: `I` (the flow's entry input, stays
fixed) and `O` (**the output of the last phase piped so far** — the only
state the type system threads through the chain).

The constraint `P extends Phase<O, PhaseIO>` asks: "is `next` a phase whose
`simulate` can accept an `O`?" Because of contravariance, that is true only
when `O` is assignable to `next`'s declared input — i.e. the current output
brand must match (or be narrower than) the next phase's input brand. Two
consequences:

- A mismatch is a **hard error with no escape hatch**: `pipe` is one
  signature, no overloads, so there is no fallback signature for the
  compiler to slide into.
- **Degradation cannot disable checking**: if some phase declares an
  unbranded `PhaseIO` (or a union) as its output, `O` becomes wide, and
  wide-`PhaseIO` is *not* assignable to a narrow input like
  `PhaseIO<"USDC","base">` — so the next `pipe` errors instead of silently
  accepting anything. This is exactly what the `@ts-expect-error` block in
  the parity test pins: if the guard ever broke, those directives would
  become unused and `bun typecheck` would fail.

## 4. `OutputOf` and the `never` existential

```ts
type OutputOf<P> = P extends Phase<never, infer O> ? O : never;
type AnyPhase = Phase<never, PhaseIO>;
```

Why `never` in the input slot? Contravariance again: `Phase<I, O>` is
assignable to `Phase<never, O>` for *every* `I` (because `never` is
assignable to everything). So `Phase<never, PhaseIO>` is the honest
universal supertype — the existential "some phase, inputs unknown." That
gives two things:

- `OutputOf<P>` can match any concrete phase and `infer` its output, so
  `pipe(...)` returns `FlowBuilder<I, OutputOf<P>>` with the *literal*
  output brands of the phase just piped — the chain state stays precise.
- `AnyPhase[]` is the runtime storage for the heterogeneous phase list.
  Crucially, an `AnyPhase` is safe to **hold** but impossible to **call**:
  calling it would require passing a `never`, which cannot be constructed.

## 5. `build()` — the single sanctioned cast

```ts
for (const phase of phaseList) {
  current = await phase.simulate(current as never, ctx);
}
```

That `as never` is the one place the type system hands over responsibility.
It is not "trust me" in general — it is justified by construction: every
adjacent pair in `phaseList` already passed `pipe`'s check, so at runtime
`current` is always the type the next phase declared. The unsoundness is
quarantined to one line instead of being smeared across the design.

## 6. What `Flow` itself is — deliberately untyped

```ts
export interface Flow {
  readonly phases: RampPhase[];
  readonly executors: PhaseHandler[];
  simulate(ctx: PhaseCtx): Promise<PhaseIO>;
  prepareTxs(ctx: PrepareCtx): Promise<PreparedFlowTxs>;
}
```

Once `build()` runs, the brands are gone. A `Flow` is a plain runtime
object: derived phase list, aggregated executors, a `simulate` that folds
the phases over `requestToIO(ctx)`, and `prepareTxs` that folds each
phase's `TxIntent`s through the nonce allocator. Neither `executors` nor
`prepareTxs` participates in the generics at all — the brand system only
ever guards *simulate adjacency*; the other two legs are kept
brand-consistent by parity tests instead of types. That is the accepted
tradeoff from design invariant 3 (README): full type-level enforcement
where the types can carry it, runtime/test checks where it would wreck
readability.

## Concretely, for the BRL flow

```ts
FlowBuilder.start(AveniaMint)                                           // O = PhaseIO<"BRLA", "base">
  .pipe(FundEphemeral(EvmToken.BRLA, Networks.Base))                    // O unchanged (passthrough brands)
  .pipe(NablaSwap(Networks.Base, EvmToken.BRLA, EvmToken.USDC))         // needs "BRLA"/"base" ✓ → O = PhaseIO<"USDC", "base">
  .pipe(SquidRouterSwap(Networks.Base, toChain, EvmToken.USDC, toToken)) // → O = PhaseIO<ToToken, ToChain>
  .pipe(DestinationTransfer<ToToken, ToChain>())                        // must match the bridged brands ✓
  .build("BrlOnrampBaseCrossChain", { isDirectTransfer: false });
```

Swap two lines, or pipe a Base-only phase after the Arbitrum bridge, and
`pipe`'s constraint fails to solve — a compile error at the exact line of
the bad adjacency. That is the whole system: literal-string brands +
contravariant property functions + a builder that threads only "current
output type" through the chain, with one audited cast where erasure meets
runtime.
