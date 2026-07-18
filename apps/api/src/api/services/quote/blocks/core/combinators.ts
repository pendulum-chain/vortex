import type { RampPhase } from "@vortexfi/shared";
import type { ChainBrand, Phase, PhaseCtx, PhaseIO, TokenBrand } from "./types";

export function branch<I extends PhaseIO, O extends PhaseIO>(
  select: (ctx: PhaseCtx) => Promise<number> | number,
  branches: Phase<I, O>[]
): Phase<I, O> {
  const unionPhases: RampPhase[] = [];
  const seen = new Set<string>();
  for (const branchPhase of branches) {
    for (const phase of branchPhase.phases) {
      if (!seen.has(phase)) {
        seen.add(phase);
        unionPhases.push(phase);
      }
    }
  }
  return {
    name: "branch",
    phases: unionPhases,
    async simulate(input: I, ctx: PhaseCtx): Promise<O> {
      const index = await select(ctx);
      const chosen = branches[index];
      if (!chosen) {
        throw new Error(`branch: select returned ${index}, no branch at that index`);
      }
      return chosen.simulate(input, ctx);
    }
  };
}

export function passthrough<Token extends TokenBrand, Chain extends ChainBrand>(): Phase<
  PhaseIO<Token, Chain>,
  PhaseIO<Token, Chain>
> {
  return {
    name: "passthrough",
    phases: [],
    async simulate(input: PhaseIO<Token, Chain>): Promise<PhaseIO<Token, Chain>> {
      return input;
    }
  };
}
