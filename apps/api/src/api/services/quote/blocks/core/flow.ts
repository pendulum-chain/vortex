import type { RampPhase } from "@vortexfi/shared";
import { computeFees } from "./fees";
import { requestToIO } from "./io";
import type { Flow, Phase, PhaseCtx, PhaseIO } from "./types";

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

  build(name: string): Flow {
    const phaseList = this.phaseList;
    const phases: RampPhase[] = phaseList.flatMap(phase => phase.phases);
    const executors = phaseList.flatMap(phase => phase.executors ?? []);
    return {
      executors,
      name,
      phases,
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
