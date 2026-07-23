import { EphemeralAccountType, type RampPhase } from "@vortexfi/shared";
import type { PhaseHandler } from "../../../phases/base-phase-handler";
import type { StateMetadata } from "../../../phases/meta-state-types";
import { computeFees } from "./fees";
import type { AnyContextMetadata } from "./metadata";
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

export class FlowBuilder<O extends PhaseIO> {
  private constructor(
    private readonly inputResolver: FlowInputResolver<PhaseIO>,
    private readonly phaseList: AnyPhase[]
  ) {}

  static start<First extends PhaseIO, Next extends PhaseIO>(
    inputResolver: FlowInputResolver<First>,
    first: AnyPhase & { simulate: (input: First, ctx: PhaseCtx) => Promise<PhaseResult<Next, unknown>> }
  ): FlowBuilder<Next> {
    return new FlowBuilder<Next>(inputResolver, [first]);
  }

  pipe<Next extends PhaseIO>(
    next: AnyPhase & { simulate: (input: O, ctx: PhaseCtx) => Promise<PhaseResult<Next, unknown>> }
  ): FlowBuilder<Next> {
    return new FlowBuilder<Next>(this.inputResolver, [...this.phaseList, next]);
  }

  build(name: string, staticStateMeta: Partial<StateMetadata> = {}): Flow<O> {
    const inputResolver = this.inputResolver;
    const phaseList = this.phaseList;
    const seenKeys = new Set<string>();
    for (const phase of phaseList) {
      if (seenKeys.has(phase.context.key)) {
        throw new Error(`Flow ${name} defines duplicate metadata key ${phase.context.key}`);
      }
      seenKeys.add(phase.context.key);
    }
    const phases: RampPhase[] = phaseList.flatMap(phase => phase.phases);
    const executors = phaseList.flatMap(phase => phase.executors ?? []);
    return {
      executors,
      name,
      phases,
      async prepareTxs(ctx: FlowPrepareCtx): Promise<PreparedFlowTxs> {
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
      async register(ctx: FlowRegisterCtx) {
        const blocks = { ...ctx.metadata.blocks };
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
          metadata: { ...ctx.metadata, blocks },
          registrationFacts,
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
          blocks[phase.context.key] = result.metadata;
          if (result.expiresAt && (!expiresAt || result.expiresAt < expiresAt)) {
            expiresAt = result.expiresAt;
          }
          current = result.output;
        }
        return {
          expiresAt,
          metadata: {
            blocks,
            globals: { fees: ctx.fees as never, partner: ctx.partner, request: ctx.request }
          },
          output: current as O
        };
      }
    };
  }
}
