// Coordinates execution of stages based on a resolved route strategy.

import { OnRampBridgeEngine } from "../engines/bridge/onramp";
import { OffRampDiscountEngine } from "../engines/discount/offramp";
import { OnRampDiscountEngine } from "../engines/discount/onramp";
import { OffRampFeeEngine } from "../engines/fee/offramp";
import { OnRampFeeEngine } from "../engines/fee/onramp";
import { OffRampFinalizeEngine } from "../engines/finalize/offramp";
import { OnRampFinalizeEngine } from "../engines/finalize/onramp";
import { OffRampInputPlannerEngine } from "../engines/input-planner/offramp";
import { OnRampInputPlannerEngine } from "../engines/input-planner/onramp";
import { OffRampSwapEngine } from "../engines/swap/offramp";
import { OnRampSwapEngine } from "../engines/swap/onramp";
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
    [StageKey.OnRampInputPlanner]: new OnRampInputPlannerEngine(),
    [StageKey.OffRampInputPlanner]: new OffRampInputPlannerEngine(),
    [StageKey.OnRampSwap]: new OnRampSwapEngine(),
    [StageKey.OffRampSwap]: new OffRampSwapEngine(),
    [StageKey.OnRampFee]: new OnRampFeeEngine(),
    [StageKey.OffRampFee]: new OffRampFeeEngine(),
    [StageKey.OnRampDiscount]: new OnRampDiscountEngine(),
    [StageKey.OffRampDiscount]: new OffRampDiscountEngine(),
    [StageKey.OnRampBridge]: new OnRampBridgeEngine(),
    [StageKey.OnRampFinalize]: new OnRampFinalizeEngine(),
    [StageKey.OffRampFinalize]: new OffRampFinalizeEngine()
  };
}
