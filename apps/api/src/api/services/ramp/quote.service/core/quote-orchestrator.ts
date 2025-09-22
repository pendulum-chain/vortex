// Coordinates execution of stages based on a resolved route strategy.

import { BridgeEngine } from "../engines/bridge-engine";
import { DiscountEngine } from "../engines/discount-engine";
import { FeeEngine } from "../engines/fee-engine";
import { FinalizeEngine } from "../engines/finalize-engine";
import { InputPlannerEngine } from "../engines/input-planner";
import { SwapEngine } from "../engines/swap-engine";
import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../types";

export class QuoteOrchestrator {
  constructor(private readonly engines: EnginesRegistry) {}

  async run(strategy: IRouteStrategy, ctx: QuoteContext): Promise<QuoteContext> {
    const stages = strategy.getStages(ctx);

    for (const stageKey of stages) {
      const engine = this.engines[stageKey];
      if (!engine) {
        throw new Error(`Engine for stage '${stageKey}' not registered in registry (strategy='${strategy.name}')`);
      }
      ctx.addNote?.(`Executing stage: ${stageKey}`);
      await engine.execute(ctx);
    }

    return ctx;
  }
}

// Simple helper to build a registry with required keys
export function buildEnginesRegistry(partial: EnginesRegistry): EnginesRegistry {
  return partial;
}

// Helper to build a default registry with all standard engines
export function buildDefaultEnginesRegistry(): EnginesRegistry {
  return {
    [StageKey.InputPlanner]: new InputPlannerEngine(),
    [StageKey.Swap]: new SwapEngine(),
    [StageKey.Fee]: new FeeEngine(),
    [StageKey.Discount]: new DiscountEngine(),
    [StageKey.Bridge]: new BridgeEngine(),
    [StageKey.Finalize]: new FinalizeEngine()
  };
}
