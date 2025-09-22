// PR1 scaffolding: Quote Orchestrator
// Coordinates execution of stages based on a resolved route strategy.
// Not wired into index.ts yet — no behavior change in PR1.

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

// Simple helper to build a registry with required keys (stubs for PR1)
export function buildEnginesRegistry(partial: EnginesRegistry): EnginesRegistry {
  // In PR1 we allow partial registry; missing stages will throw at runtime if executed.
  return partial;
}
