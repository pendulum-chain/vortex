import { EphemeralAccountType, type RampPhase } from "@vortexfi/shared";
import type { PhaseHandler } from "../../../phases/base-phase-handler";
import type { StateMetadata } from "../../../phases/meta-state-types";
import { computeFees } from "./fees";
import type { AnyContextMetadata, ContextKey, ContextSimulation } from "./metadata";
import { aggregateNativePrefunding, allocateNonces } from "./prepare";
import type {
  Flow,
  FlowInputResolver,
  FlowPrepareCtx,
  FlowRegisterCtx,
  PhaseCtx,
  PhaseIO,
  PhaseResult,
  PrepareCtx,
  PreparedFlowTxs,
  PreparedPhaseTxs,
  RegistrationResult,
  TxIntent
} from "./types";

type OutputOf<P> = P extends { simulate: (input: never, ctx: PhaseCtx) => Promise<PhaseResult<infer O, unknown>> } ? O : never;
type ContextOf<P> = P extends { context: infer Context extends AnyContextMetadata } ? Context : never;
type MetadataKeyOf<P> = ContextKey<ContextOf<P>>;
type MetadataOf<P> = Record<MetadataKeyOf<P>, ContextSimulation<ContextOf<P>>>;
type ResolverOutput<R> = R extends (ctx: PhaseCtx) => infer Result
  ? Awaited<Result> extends PhaseIO
    ? Awaited<Result>
    : never
  : never;
type RawRegistrationFactsOf<P extends AnyPhase> = NonNullable<P["register"]> extends (
  ctx: never
) => Promise<RegistrationResult<infer Facts, unknown>>
  ? Facts
  : never;
type RegistrationFactsOf<P extends AnyPhase> = RawRegistrationFactsOf<P> extends infer Facts
  ? [Facts] extends [never]
    ? Record<never, never>
    : Record<MetadataKeyOf<P>, Facts>
  : Record<never, never>;
type RegistrationInputOf<P extends AnyPhase> = [RawRegistrationFactsOf<P>] extends [never]
  ? Record<never, never>
  : Parameters<NonNullable<P["register"]>>[0] extends { input: Readonly<infer Input extends Record<string, unknown>> }
    ? Input
    : Record<never, never>;

// Internal type-erased phase storage. `never` input makes any Phase<I, O> assignable under
// contravariance; the builder's pipe() adjacency check is what guarantees the runtime inputs line up.
type AnyPhase = {
  readonly executors?: PhaseHandler[];
  readonly context: AnyContextMetadata;
  readonly name: string;
  readonly phases: RampPhase[];
  readonly prepareTxs?: (ctx: never) => Promise<{ intents: TxIntent[]; state?: unknown }>;
  readonly register?: (ctx: never) => Promise<RegistrationResult<unknown, unknown>>;
  readonly simulate: (input: never, ctx: PhaseCtx) => Promise<PhaseResult<PhaseIO, unknown>>;
};

export class FlowBuilder<
  I extends PhaseIO,
  O extends PhaseIO,
  Blocks extends Record<string, unknown>,
  RegistrationFacts extends Record<string, unknown>,
  RegistrationInput extends Record<string, unknown>
> {
  private constructor(
    private readonly inputResolver: FlowInputResolver<I>,
    private readonly phaseList: AnyPhase[]
  ) {}

  static start<R, P extends AnyPhase>(
    inputResolver: R & FlowInputResolver<ResolverOutput<R>>,
    first: P &
      (P extends {
        simulate: (input: ResolverOutput<R>, ctx: PhaseCtx) => Promise<PhaseResult<PhaseIO, unknown>>;
      }
        ? unknown
        : never)
  ): FlowBuilder<ResolverOutput<R>, OutputOf<P>, MetadataOf<P>, RegistrationFactsOf<P>, RegistrationInputOf<P>> {
    return new FlowBuilder<ResolverOutput<R>, OutputOf<P>, MetadataOf<P>, RegistrationFactsOf<P>, RegistrationInputOf<P>>(
      inputResolver,
      [first]
    );
  }

  pipe<P extends AnyPhase & { simulate: (input: O, ctx: PhaseCtx) => Promise<PhaseResult<PhaseIO, unknown>> }>(
    next: P & (MetadataKeyOf<P> extends keyof Blocks ? never : unknown)
  ): FlowBuilder<
    I,
    OutputOf<P>,
    Blocks & MetadataOf<P>,
    RegistrationFacts & RegistrationFactsOf<P>,
    RegistrationInput & RegistrationInputOf<P>
  > {
    return new FlowBuilder(this.inputResolver, [...this.phaseList, next]);
  }

  build(name: string, staticStateMeta: Partial<StateMetadata> = {}): Flow<O, Blocks, RegistrationFacts, RegistrationInput> {
    const inputResolver = this.inputResolver;
    const phaseList = this.phaseList;
    const phases: RampPhase[] = phaseList.flatMap(phase => phase.phases);
    const executors = phaseList.flatMap(phase => phase.executors ?? []);
    return {
      executors,
      name,
      phases,
      async prepareTxs(ctx: FlowPrepareCtx<Blocks, RegistrationFacts>): Promise<PreparedFlowTxs> {
        const intents: TxIntent[] = [];
        const blockState: Record<string, unknown> = {};
        const accountAddresses = Object.fromEntries(
          Object.entries(ctx.accounts).flatMap(([type, account]) => (account ? [[type, account.address]] : []))
        );
        const stateMeta: Omit<Partial<StateMetadata>, "blockState"> = {
          accountAddresses,
          ...(ctx.destinationAddress ? { destinationAddress: ctx.destinationAddress } : {}),
          ...(ctx.accounts[EphemeralAccountType.EVM]
            ? { evmEphemeralAddress: ctx.accounts[EphemeralAccountType.EVM].address }
            : {}),
          ...(ctx.accounts[EphemeralAccountType.Substrate]
            ? { substrateEphemeralAddress: ctx.accounts[EphemeralAccountType.Substrate].address }
            : {}),
          ...staticStateMeta
        };
        for (const phase of phaseList) {
          if (!phase.prepareTxs) {
            continue;
          }
          const prepareTxs = phase.prepareTxs as (ctx: PrepareCtx<never, never>) => Promise<PreparedPhaseTxs>;
          const prepared = await prepareTxs({
            accounts: ctx.accounts,
            destinationAddress: ctx.destinationAddress,
            globals: ctx.metadata.globals,
            ownMetadata: ctx.metadata.blocks[phase.context.key] as never,
            ownRegistrationFacts: ctx.registrationFacts?.[phase.context.key] as never,
            quote: ctx.quote,
            taxId: ctx.taxId,
            userId: ctx.userId
          });
          intents.push(...prepared.intents);
          if (prepared.state !== undefined) {
            blockState[phase.context.key] = prepared.state;
          }
        }
        // Same bookends assemblePhaseFlow adds — asserted equal in the parity test.
        return {
          stateMeta: {
            ...stateMeta,
            blockState,
            phaseFlow: ["initial", ...phases, "complete"],
            transactionPlan: { nativePrefunding: aggregateNativePrefunding(intents) }
          },
          unsignedTxs: allocateNonces(intents)
        };
      },
      async register(ctx: FlowRegisterCtx<Blocks, RegistrationInput>) {
        const blocks = { ...ctx.metadata.blocks } as Record<string, unknown>;
        const registrationFacts: Record<string, unknown> = {};
        const responseArtifacts: Record<string, unknown> = {};
        for (const phase of phaseList) {
          if (!phase.register) {
            continue;
          }
          const result = await phase.register({
            authenticatedUser: ctx.authenticatedUser,
            input: ctx.input,
            ipAddress: ctx.ipAddress,
            metadata: blocks[phase.context.key],
            quote: ctx.quote,
            signingAccounts: ctx.signingAccounts,
            transaction: ctx.transaction
          } as never);
          registrationFacts[phase.context.key] = result.facts;
          if (result.metadata !== undefined) {
            blocks[phase.context.key] = result.metadata;
          }
          if (result.responseArtifacts !== undefined) {
            responseArtifacts[phase.context.key] = result.responseArtifacts;
          }
        }
        return {
          metadata: { ...ctx.metadata, blocks: blocks as Blocks },
          registrationFacts: registrationFacts as RegistrationFacts,
          responseArtifacts
        };
      },
      async simulate(ctx: PhaseCtx) {
        await computeFees(ctx);
        if (!ctx.fees?.usd) {
          throw new Error("Flow simulation requires computed USD fees");
        }
        let current: PhaseIO = await inputResolver(ctx);
        let expiresAt: Date | undefined;
        const blocks: Record<string, unknown> = {};
        for (const phase of phaseList) {
          const result = await phase.simulate(current as never, ctx);
          if (result.fees) {
            ctx.fees = result.fees;
          }
          if (Object.hasOwn(blocks, phase.context.key)) {
            throw new Error(`Flow ${name} defines duplicate metadata key ${phase.context.key}`);
          }
          blocks[phase.context.key] = result.metadata;
          if (result.expiresAt && (!expiresAt || result.expiresAt < expiresAt)) {
            expiresAt = result.expiresAt;
          }
          current = result.output;
        }
        return {
          expiresAt,
          metadata: {
            blocks: blocks as Blocks,
            globals: { fees: ctx.fees as never, partner: ctx.partner, request: ctx.request }
          },
          output: current as O
        };
      }
    };
  }
}
