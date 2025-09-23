import { IRouteStrategy, QuoteContext, StageKey } from "../../types";

/**
 * Off-ramp to PIX (BRL) strategy
 * Pipeline: InputPlanner -> Swap -> Fee -> Discount -> Finalize
 */
export class OffRampPixStrategy implements IRouteStrategy {
  readonly name = "OffRampPix";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [
      StageKey.OffRampInputPlanner,
      StageKey.OffRampSwap,
      StageKey.OffRampFee,
      StageKey.OffRampDiscount,
      StageKey.OffRampFinalize
    ];
  }
}
