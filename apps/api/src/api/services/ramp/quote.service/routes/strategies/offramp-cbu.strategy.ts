import { IRouteStrategy, QuoteContext, StageKey } from "../../types";

/**
 * Off-ramp to CBU (ARS) strategy
 * Pipeline: InputPlanner -> Swap -> Fee -> Discount -> Finalize
 */
export class OffRampCbuStrategy implements IRouteStrategy {
  readonly name = "OffRampCbu";

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
