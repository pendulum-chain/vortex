# The Flow Type System

`FlowBuilder` checks only the boundary that makes blocks composable:
simulation input/output adjacency and simulation metadata ownership.
Preparation and execution remain implementation concerns verified by tests.

## 1. Monetary IO uses literal brands

```ts
export interface PhaseIO<Token extends string = string, Chain extends string = string> {
  amount: Big;
  amountRaw: string;
  token: Token;
  chain: Chain;
}
```

`PhaseIO<"BRLA", "base">` and `PhaseIO<"USDC", "base">` differ because
their token properties are different string literal types. When token values
overlap across ecosystems, the chain literal provides the discrimination.

Metadata is intentionally not carried in `PhaseIO`. It is owned by the block
that produces it and accumulated separately by the flow.

## 2. A context types simulation metadata only

```ts
export interface ContextMetadata<Key extends string, Simulation> {
  readonly key: Key;
  readonly [simulationType]: Simulation;
}

export const SquidRouterSwapContext =
  defineContext<SquidRouterSwapMetadata>()("squidRouterSwap");
```

The runtime descriptor contains the key. The symbol property carries the
simulation type for TypeScript. Contexts do not declare preparation types,
runtime types, or dependencies on other blocks.

## 3. `Phase.simulate` is the typed boundary

```ts
export interface Phase<Context extends AnyContextMetadata, I extends PhaseIO, O extends PhaseIO> {
  readonly context: Context;
  readonly simulate: (
    input: I,
    ctx: PhaseCtx
  ) => Promise<PhaseResult<O, ContextSimulation<Context>>>;
  readonly prepareTxs?: (
    ctx: PrepareCtx<ContextSimulation<Context>>
  ) => Promise<PreparedPhaseTxs>;
  readonly executors?: PhaseHandler[];
}
```

`simulate` is a function-typed property rather than a method. Under
`strictFunctionTypes`, its input is checked contravariantly, so a phase cannot
silently accept the wrong token or chain through bivariant method parameters.

Each simulation returns two independent values:

```ts
interface PhaseResult<O extends PhaseIO, Metadata> {
  output: O;
  metadata: Metadata;
}
```

`output` feeds the next block. `metadata` is stored under the block's context
key and never enters the next block's `PhaseIO`.

## 4. The builder tracks three things

```ts
FlowBuilder<I, O, Blocks>
```

- `I` is the flow's entry IO type.
- `O` is the output type of the most recently composed block.
- `Blocks` is the accumulated simulation metadata map.

Starting with Avenia produces approximately:

```ts
FlowBuilder<
  PhaseIO,
  PhaseIO<"BRLA", "base">,
  { aveniaMint: AveniaMintMetadata }
>
```

## 5. `pipe` checks adjacency and key ownership

The real signature is expressed with the type-erased `AnyPhase`, but its two
constraints are equivalent to:

```ts
pipe<P extends PhaseAccepting<O>>(
  next: P & (MetadataKeyOf<P> extends keyof Blocks ? never : unknown)
): FlowBuilder<I, OutputOf<P>, Blocks & MetadataOf<P>>;
```

The first constraint asks whether `next.simulate` accepts the current `O`.
The second rejects a context key already present in `Blocks`. A successful
call advances `O` and intersects the new metadata entry into `Blocks`.

The skipped compile-time test pins wrong-token, wrong-chain, and duplicate-key
failures with `@ts-expect-error`. If a guard stops working, the directive
becomes unused and typecheck fails.

## 6. Runtime storage is deliberately erased

The builder must place heterogeneous phases in one array. `AnyPhase` therefore
uses a `never` simulation input:

```ts
type AnyPhase = {
  readonly context: AnyContextMetadata;
  readonly simulate: (
    input: never,
    ctx: PhaseCtx
  ) => Promise<PhaseResult<PhaseIO, unknown>>;
  // execution and preparation fields omitted here
};
```

Under contravariance, every concrete phase can be stored in this shape, but
the erased function cannot be called with a real value. The simulation loop
contains the single cast justified by prior composition:

```ts
for (const phase of phaseList) {
  const result = await phase.simulate(current as never, ctx);
  blocks[phase.context.key] = result.metadata;
  current = result.output;
}
```

The built `Flow<O, Blocks>` retains its final output and metadata types even
though the internal phase array is erased.

## 7. Preparation does not extend the composition type system

After simulation, `Flow.prepareTxs` gives each block its own simulation
metadata and collects its implementation-defined result:

```ts
interface PreparedPhaseTxs {
  intents: TxIntent[];
  state?: unknown;
}
```

State is stored under `blockState[context.key]`, but its shape is not inferred
by `FlowBuilder`. Executors may assert their own local state type when reading
it. There is no context-level dependency graph and no block may require
another block by identity.

## 8. Shared resources are aggregated structurally

Nonce assignment and native prefunding are flow-level resources. A transaction
that needs native call value declares it on its intent:

```ts
interface TxIntent {
  network: Networks;
  signer: string;
  lane: "main" | "backup" | "cleanup";
  prefundNativeValueRaw?: string;
  // phase and transaction data omitted
}
```

After every block prepares, the flow sums `prefundNativeValueRaw` by
`(network, signer)` and persists:

```ts
state.transactionPlan.nativePrefunding[`${network}:${signer.toLowerCase()}`]
```

`FundEphemeral` consumes that generic plan and funds only the difference
between the current native balance and:

```text
fixed gas reserve + aggregated native prefunding
```

The funding block does not know which block requested the value. Any future
block can participate by emitting the same structural intent field.

## 9. Concrete BRL flow

```ts
FlowBuilder.start(AveniaMint)                                           // BRLA on Base
  .pipe(FundEphemeral(EvmToken.BRLA, Networks.Base))                    // unchanged
  .pipe(SubsidizePre<typeof EvmToken.BRLA, typeof Networks.Base>())
  .pipe(NablaSwap(Networks.Base, EvmToken.BRLA, EvmToken.USDC))         // USDC on Base
  .pipe(DistributeFees<typeof EvmToken.USDC, typeof Networks.Base>())
  .pipe(SubsidizePost<typeof EvmToken.USDC, typeof Networks.Base>())
  .pipe(SquidRouterSwap(Networks.Base, toChain, EvmToken.USDC, toToken)) // destination IO
  .pipe(FinalSettlementSubsidy<ToToken, ToChain>())
  .pipe(DestinationTransfer<ToToken, ToChain>())
  .build("BrlOnrampBaseCrossChain", { isDirectTransfer: false });
```

The type system guarantees the simulation chain and metadata ownership. The
parity tests verify phase expansion, executors, prepared transactions, nonce
lanes, namespaced preparation state, and native prefunding aggregation.
