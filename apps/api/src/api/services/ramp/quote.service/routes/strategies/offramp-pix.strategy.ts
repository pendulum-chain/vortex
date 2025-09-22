import { IRouteStrategy, QuoteContext, StageKey } from "../../types";

/**
 * Off-ramp to PIX (BRL) strategy
 * Pipeline: InputPlanner -> Swap -> Fee -> Discount -> Finalize
 */
export class OffRampPixStrategy implements IRouteStrategy {
  readonly name = "OffRampPix";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [StageKey.InputPlanner, StageKey.Swap, StageKey.Fee, StageKey.Discount, StageKey.Finalize];
  }
}
