// Returns an empty stage list.

import { IRouteStrategy, QuoteContext, StageKey } from "../../types";

export class OffRampSepaStrategy implements IRouteStrategy {
  readonly name = "OffRampSepa";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [];
  }
}
