import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../core/types";

type StageListFactory = (ctx: QuoteContext) => StageKey[];
type EngineRegistryFactory = (ctx: QuoteContext) => EnginesRegistry;

interface RouteDefinition {
  engines: EngineRegistryFactory;
  name: string;
  stages: readonly StageKey[] | StageListFactory;
}

export function defineRouteStrategy(definition: RouteDefinition): IRouteStrategy {
  return {
    getEngines(ctx) {
      return definition.engines(ctx);
    },
    getStages(ctx) {
      return typeof definition.stages === "function" ? definition.stages(ctx) : [...definition.stages];
    },
    name: definition.name
  };
}

export function withHydrationForNonUsdc(stages: readonly StageKey[]): StageListFactory {
  return ctx => {
    if (ctx.request.outputCurrency === "USDC") {
      return [...stages];
    }

    const finalizeIndex = stages.indexOf(StageKey.Finalize);
    if (finalizeIndex === -1) {
      return [...stages, StageKey.HydrationSwap];
    }

    return [...stages.slice(0, finalizeIndex), StageKey.HydrationSwap, ...stages.slice(finalizeIndex)];
  };
}
