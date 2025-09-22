// Coordinates execution of stages based on a resolved route strategy.
// Not wired into index.ts yet — no behavior change in .

import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../types";

export class QuoteOrchestrator {
  constructor(private readonly engines: EnginesRegistry) {}

  async run(strategy: IRouteStrategy, ctx: QuoteContext): Promise<void> {
    const stages = strategy.getStages(ctx);

    for (const stageKey of stages) {
      const engine = this.engines[stageKey];
      if (!engine) {
        throw new Error(`Engine for stage '${stageKey}' not registered in registry (strategy='${strategy.name}')`);
      }
      ctx.addNote?.(`Executing stage: ${stageKey}`);
      await engine.execute(ctx);
    }
  }
}

// Simple helper to build a registry with required keys
export function buildEnginesRegistry(partial: EnginesRegistry): EnginesRegistry {
  return partial;
}
