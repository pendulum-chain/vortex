// Returns an empty stage list.

import { IRouteStrategy, QuoteContext, StageKey } from "../../types";

export class OffRampPixStrategy implements IRouteStrategy {
  readonly name = "OffRampPix";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [];
  }
}
