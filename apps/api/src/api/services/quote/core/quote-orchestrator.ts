import { EnginesRegistry, IRouteStrategy, QuoteContext } from "./types";

// Coordinates execution of stages based on a resolved route strategy.
export class QuoteOrchestrator {
  constructor(private readonly engines?: EnginesRegistry) {}

  async run(strategy: IRouteStrategy, ctx: QuoteContext): Promise<QuoteContext> {
    const stages = strategy.getStages(ctx);
    const engines = this.engines ? this.engines : strategy.getEngines(ctx);

    for (const stageKey of stages) {
      const engine = engines[stageKey];
      if (!engine) {
        throw new Error(`Engine for stage '${stageKey}' not registered in registry (strategy='${strategy.name}')`);
      }
      ctx.addNote?.(`Executing stage: ${stageKey}`);
      await engine.execute(ctx);
    }

    return ctx;
  }
}
