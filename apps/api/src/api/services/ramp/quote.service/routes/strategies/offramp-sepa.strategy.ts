import { IRouteStrategy, QuoteContext, StageKey } from "../../types";

/**
 * Off-ramp to SEPA (EURC) strategy
 * Pipeline: InputPlanner -> Swap -> Fee -> Discount -> Finalize
 */
export class OffRampSepaStrategy implements IRouteStrategy {
  readonly name = "OffRampSepa";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [StageKey.InputPlanner, StageKey.Swap, StageKey.Fee, StageKey.Discount, StageKey.Finalize];
  }
}
