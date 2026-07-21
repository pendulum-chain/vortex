import type { RampPhase } from "@vortexfi/shared";
import type { PhaseHandler } from "../../../phases/base-phase-handler";
import type { StateMetadata } from "../../../phases/meta-state-types";
import { computeFees } from "./fees";
import { requestToIO } from "./io";
import type { AnyContextMetadata, ContextKey, ContextSimulation } from "./metadata";
import { aggregateNativePrefunding, allocateNonces } from "./prepare";
import type {
  Flow,
  FlowPrepareCtx,
  PhaseCtx,
  PhaseIO,
  PhaseResult,
  PrepareCtx,
  PreparedFlowTxs,
  PreparedPhaseTxs,
  TxIntent
} from "./types";

type OutputOf<P> = P extends { simulate: (input: never, ctx: PhaseCtx) => Promise<PhaseResult<infer O, unknown>> } ? O : never;
type ContextOf<P> = P extends { context: infer Context extends AnyContextMetadata } ? Context : never;
type MetadataKeyOf<P> = ContextKey<ContextOf<P>>;
type MetadataOf<P> = Record<MetadataKeyOf<P>, ContextSimulation<ContextOf<P>>>;

// Internal type-erased phase storage. `never` input makes any Phase<I, O> assignable under
// contravariance; the builder's pipe() adjacency check is what guarantees the runtime inputs line up.
type AnyPhase = {
  readonly executors?: PhaseHandler[];
  readonly context: AnyContextMetadata;
  readonly name: string;
  readonly phases: RampPhase[];
  readonly prepareTxs?: (ctx: PrepareCtx<never>) => Promise<{ intents: TxIntent[]; state?: unknown }>;
  readonly simulate: (input: never, ctx: PhaseCtx) => Promise<PhaseResult<PhaseIO, unknown>>;
};

export class FlowBuilder<I extends PhaseIO, O extends PhaseIO, Blocks extends Record<string, unknown>> {
  private constructor(private readonly phaseList: AnyPhase[]) {}

  static start<P extends AnyPhase>(first: P): FlowBuilder<PhaseIO, OutputOf<P>, MetadataOf<P>> {
    return new FlowBuilder([first]);
  }

  pipe<P extends AnyPhase & { simulate: (input: O, ctx: PhaseCtx) => Promise<PhaseResult<PhaseIO, unknown>> }>(
    next: P & (MetadataKeyOf<P> extends keyof Blocks ? never : unknown)
  ): FlowBuilder<I, OutputOf<P>, Blocks & MetadataOf<P>> {
    return new FlowBuilder([...this.phaseList, next]);
  }

  build(name: string, staticStateMeta: Partial<StateMetadata> = {}): Flow<O, Blocks> {
    const phaseList = this.phaseList;
    const phases: RampPhase[] = phaseList.flatMap(phase => phase.phases);
    const executors = phaseList.flatMap(phase => phase.executors ?? []);
    return {
      executors,
      name,
      phases,
      async prepareTxs(ctx: FlowPrepareCtx<Blocks>): Promise<PreparedFlowTxs> {
        const intents: TxIntent[] = [];
        const blockState: Record<string, unknown> = {};
        const stateMeta: Omit<Partial<StateMetadata>, "blockState"> = {
          destinationAddress: ctx.destinationAddress,
          evmEphemeralAddress: ctx.evmEphemeral.address,
          ...staticStateMeta
        };
        for (const phase of phaseList) {
          if (!phase.prepareTxs) {
            continue;
          }
          const prepared = await phase.prepareTxs({
            destinationAddress: ctx.destinationAddress,
            evmEphemeral: ctx.evmEphemeral,
            globals: ctx.metadata.globals,
            ownMetadata: ctx.metadata.blocks[phase.context.key] as never,
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
      async simulate(ctx: PhaseCtx) {
        await computeFees(ctx);
        if (!ctx.fees?.usd) {
          throw new Error("Flow simulation requires computed USD fees");
        }
        let current: PhaseIO = requestToIO(ctx);
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
          current = result.output;
        }
        return {
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
