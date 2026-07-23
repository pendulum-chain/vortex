# The Flow Type System

`FlowBuilder` checks the boundaries that make blocks composable at compile
time: source resolver/first-phase adjacency and phase input/output adjacency.
Simulation metadata ownership (no duplicate context keys) is enforced at
`build()` time, which runs at module load. Metadata, registration facts, and
registration input are typed per phase but erased at the flow level — the
catalog returns bare `Flow`, so nothing downstream consumed those types.
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

## 4. The builder tracks one thing

```ts
FlowBuilder<O>
```

`O` is the output type of the most recently composed block. It is the only
type-level state the builder carries: it is what the next `pipe` checks its
phase against. Starting with Avenia produces:

```ts
FlowBuilder<PhaseIO<"BRLA", "base">>
```

Simulation metadata, registration facts, and registration input are not
accumulated. Each phase types them locally (section 7), and the flow handles
them as `Record<string, unknown>` keyed by context key.

## 5. `start` and `pipe` check adjacency

Both signatures state their boundary check directly — the next output is
inferred from the covariant return position of the argument's `simulate`,
and the input side is checked contravariantly in place:

```ts
static start<First extends PhaseIO, Next extends PhaseIO>(
  inputResolver: FlowInputResolver<First>,
  first: AnyPhase & { simulate: (input: First, ctx: PhaseCtx) => Promise<PhaseResult<Next, unknown>> }
): FlowBuilder<Next>;

pipe<Next extends PhaseIO>(
  next: AnyPhase & { simulate: (input: O, ctx: PhaseCtx) => Promise<PhaseResult<Next, unknown>> }
): FlowBuilder<Next>;
```

In `start`, `First` may be inferred from either argument; soundness does not
depend on which one wins. Whatever `First` resolves to, the call only checks
if the resolver's output is assignable to `First` (covariant) and `First` is
assignable to the phase's input (contravariant) — together forcing resolver
output ⊆ phase input. The requirement is assignability, not type equality.

For example, `AlfredpayMint` accepts four fiat tokens:

```ts
type AlfredpayOnrampFiat = "ARS" | "COP" | "MXN" | "USD";
type InputOfAlfredpayMint = PhaseIO<AlfredpayOnrampFiat, "fiat">;
```

A resolver restricted to USD can safely feed that phase:

```ts
const resolver = fiatRequestIO(FiatToken.USD);
type ResolverIO = PhaseIO<"USD", "fiat">;

FlowBuilder.start(resolver, AlfredpayMint); // valid
```

`ResolverIO` and `InputOfAlfredpayMint` are not equal, but every value the
resolver can produce is accepted by the phase. The reverse relationship would
be unsafe: a resolver that may produce a token outside the phase's accepted
union is rejected, because under `strictFunctionTypes` the phase's `simulate`
property is checked contravariantly in its input.

`pipe` performs the corresponding check between the previous phase's output
and the next phase's input. A successful call advances `O`.

Metadata key ownership is no longer a compile-time constraint. `build()`
walks the phase list and throws on a duplicate context key; since every flow
is constructed at module load, a duplicate key fails the process (and any
test run) immediately.

The skipped compile-time test pins wrong-token and wrong-chain failures with
`@ts-expect-error`. If a guard stops working, the directive becomes unused
and typecheck fails. Duplicate keys are pinned by a runtime test against
`build()`.

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

The built `Flow<O>` retains its final output type even though the internal
phase array and the accumulated metadata map are erased. Typed access to a
block's metadata goes through its context descriptor
(`getBlockMetadata(metadata, SomeContext)`), the same path executors use.

## 7. Registration and preparation

Registration introduces two types distinct from simulation IO and metadata:

```ts
interface RegisterCtx<Metadata, RegistrationInput extends Record<string, unknown>> {
  authenticatedUser: Readonly<{ id: string }>;
  input: Readonly<RegistrationInput>;
  metadata: Readonly<Metadata>;
  quote: Readonly<QuoteFields>;
  signingAccounts: readonly AccountMeta[];
  ipAddress?: string;
  transaction?: Transaction;
}

interface RegistrationResult<RegistrationFacts, Metadata> {
  facts: RegistrationFacts;
  metadata?: Metadata;
  responseArtifacts?: Readonly<Record<string, unknown>>;
}
```

- `RegistrationInput` is caller-supplied data required in addition to the
  quote, such as an email address, wallet address, PIX destination, or tax ID.
  It is potentially untrusted even when an API boundary has normalized it. A
  registering phase must validate the fields it consumes before using them.
- `RegistrationFacts` is trusted data derived by the system during
  registration, after validation or a provider operation. Examples include a
  normalized tax ID, a validated destination, or a provider transaction ID.
  Later phases do not accept these values directly from caller input.

Each registering phase declares both types locally:

```ts
Phase<Context, I, O, RegistrationFacts, RegistrationInput>
```

They type the phase's own `register` and `prepareTxs` pairing and nothing
else. At the flow level both are erased: `Flow.register` accepts the shared
caller input as `Record<string, unknown>` — consistent with it being
untrusted, since every registering phase must runtime-validate the fields it
consumes regardless — and namespaces the resulting facts by context key at
runtime:

```ts
// Facts produced by two registering phases
{
  evmOfframpSource: { userAddress: string };
  aveniaOfframpPayout: { brlaEvmAddress: string; pixDestination: string };
}
```

`Phase.register` is optional. It receives the shared potentially untrusted
input, authenticated-user context, signing accounts, the read-only quote,
optional transaction/IP data, and only its own simulation metadata.
`Flow.register` collects each phase's trusted facts under that phase's context
key, applies optional same-phase metadata refreshes, and namespaces response
artifacts. During preparation, a phase receives only its own facts as
`ownRegistrationFacts`; facts are never passed through another phase's input.

After simulation, `Flow.prepareTxs` gives each block its own simulation
metadata, only its own registration facts, and generic account capabilities
keyed by `EphemeralAccountType`. It then collects the implementation-defined result:

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
  nonceSpan?: number;
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
FlowBuilder.start(fiatRequestIO(FiatToken.BRL), AveniaMint)             // BRLA on Base
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

The type system guarantees the simulation chain; `build()` guarantees
metadata ownership at module load. The parity tests verify phase expansion,
executors, prepared transactions, nonce lanes, namespaced preparation state,
and native prefunding aggregation.
