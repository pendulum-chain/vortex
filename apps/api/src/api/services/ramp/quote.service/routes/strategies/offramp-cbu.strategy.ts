// Returns an empty stage list.

import { IRouteStrategy, QuoteContext, StageKey } from "../../types";

export class OffRampCbuStrategy implements IRouteStrategy {
  readonly name = "OffRampCbu";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [];
  }
}
