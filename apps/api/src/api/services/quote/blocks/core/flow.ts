import type { RampPhase } from "@vortexfi/shared";
import type { StateMetadata } from "../../../phases/meta-state-types";
import { computeFees } from "./fees";
import { requestToIO } from "./io";
import { allocateNonces } from "./prepare";
import type { Flow, Phase, PhaseCtx, PhaseIO, PrepareCtx, PreparedFlowTxs, TxIntent } from "./types";

type OutputOf<P> = P extends Phase<never, infer O> ? O : never;

// Internal type-erased phase storage. `never` input makes any Phase<I, O> assignable under
// contravariance; the builder's pipe() adjacency check is what guarantees the runtime inputs line up.
type AnyPhase = Phase<never, PhaseIO>;

export class FlowBuilder<I extends PhaseIO, O extends PhaseIO> {
  private constructor(private readonly phaseList: AnyPhase[]) {}

  static start<P extends AnyPhase>(first: P): FlowBuilder<PhaseIO, OutputOf<P>> {
    return new FlowBuilder<PhaseIO, OutputOf<P>>([first]);
  }

  pipe<P extends Phase<O, PhaseIO>>(next: P): FlowBuilder<I, OutputOf<P>> {
    return new FlowBuilder<I, OutputOf<P>>([...this.phaseList, next]);
  }

  build(name: string, staticStateMeta: Partial<StateMetadata> = {}): Flow {
    const phaseList = this.phaseList;
    const phases: RampPhase[] = phaseList.flatMap(phase => phase.phases);
    const executors = phaseList.flatMap(phase => phase.executors ?? []);
    return {
      executors,
      name,
      phases,
      async prepareTxs(ctx: PrepareCtx): Promise<PreparedFlowTxs> {
        const intents: TxIntent[] = [];
        let stateMeta: Partial<StateMetadata> = {
          destinationAddress: ctx.destinationAddress,
          evmEphemeralAddress: ctx.evmEphemeral.address,
          ...staticStateMeta
        };
        for (const phase of phaseList) {
          if (!phase.prepareTxs) {
            continue;
          }
          const prepared = await phase.prepareTxs(ctx);
          intents.push(...prepared.intents);
          stateMeta = { ...stateMeta, ...prepared.stateMeta };
        }
        // Same bookends assemblePhaseFlow adds — asserted equal in the parity test.
        return {
          stateMeta: { ...stateMeta, phaseFlow: ["initial", ...phases, "complete"] },
          unsignedTxs: allocateNonces(intents)
        };
      },
      async simulate(ctx: PhaseCtx): Promise<PhaseIO> {
        await computeFees(ctx);
        let current: PhaseIO = requestToIO(ctx);
        for (const phase of phaseList) {
          current = await phase.simulate(current as never, ctx);
        }
        return current;
      }
    };
  }
}
