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
