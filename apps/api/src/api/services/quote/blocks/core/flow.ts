import type { RampPhase } from "@vortexfi/shared";
import { requestToIO } from "./io";
import type { Flow, Phase, PhaseCtx, PhaseIO } from "./types";

type OutputOf<P> = P extends Phase<PhaseIO, infer O> ? O : never;

export class FlowBuilder<I extends PhaseIO, O extends PhaseIO> {
  private constructor(private readonly phaseList: Phase<PhaseIO, PhaseIO>[]) {}

  static start<P extends Phase<PhaseIO, PhaseIO>>(first: P): FlowBuilder<PhaseIO, OutputOf<P>> {
    return new FlowBuilder<PhaseIO, OutputOf<P>>([first]);
  }

  pipe<P extends Phase<O, PhaseIO>>(next: P): FlowBuilder<I, OutputOf<P>> {
    return new FlowBuilder<I, OutputOf<P>>([...this.phaseList, next]);
  }

  build(name: string): Flow {
    const phaseList = this.phaseList;
    const phases: RampPhase[] = phaseList.flatMap(phase => phase.phases);
    return {
      name,
      phases,
      async simulate(ctx: PhaseCtx): Promise<PhaseIO> {
        let current: PhaseIO = requestToIO(ctx);
        for (const phase of phaseList) {
          current = await phase.simulate(current, ctx);
        }
        return current;
      }
    };
  }
}
