import type { RampPhase } from "@vortexfi/shared";
import type { AnyContextMetadata, ContextSimulation } from "./metadata";
import type { ChainBrand, Phase, PhaseCtx, PhaseIO, TokenBrand } from "./types";

export function branch<Context extends AnyContextMetadata, I extends PhaseIO, O extends PhaseIO>(
  context: Context,
  select: (ctx: PhaseCtx) => Promise<number> | number,
  branches: [Phase<Context, I, O>, ...Phase<Context, I, O>[]]
): Phase<Context, I, O> {
  const unionPhases: RampPhase[] = [];
  const seen = new Set<string>();
  for (const branchPhase of branches) {
    if (branchPhase.context.key !== context.key) {
      throw new Error(`branch: expected metadata key ${context.key}, received ${branchPhase.context.key}`);
    }
    for (const phase of branchPhase.phases) {
      if (!seen.has(phase)) {
        seen.add(phase);
        unionPhases.push(phase);
      }
    }
  }
  return {
    context,
    name: "branch",
    phases: unionPhases,
    async simulate(input: I, ctx: PhaseCtx) {
      const index = await select(ctx);
      const chosen = branches[index];
      if (!chosen) {
        throw new Error(`branch: select returned ${index}, no branch at that index`);
      }
      return chosen.simulate(input, ctx);
    }
  };
}

export function passthrough<Context extends AnyContextMetadata, Token extends TokenBrand, Chain extends ChainBrand>(
  context: Context,
  metadata: ContextSimulation<Context>
): Phase<Context, PhaseIO<Token, Chain>, PhaseIO<Token, Chain>> {
  return {
    context,
    name: "passthrough",
    phases: [],
    async simulate(input: PhaseIO<Token, Chain>) {
      return { metadata, output: input };
    }
  };
}
