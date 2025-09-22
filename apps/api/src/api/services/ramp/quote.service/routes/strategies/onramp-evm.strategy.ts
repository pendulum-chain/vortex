import { FiatToken } from "@packages/shared";
import { IRouteStrategy, QuoteContext, StageKey } from "../../types";

// On-ramp to EVM strategy
export class OnRampEvmStrategy implements IRouteStrategy {
  readonly name = "OnRampEvm";

  getStages(ctx: QuoteContext): StageKey[] {
    // EUR special-case handled by dedicated engine
    if (ctx.request.inputCurrency === FiatToken.EURC) {
      return [StageKey.SpecialOnrampEurEvm];
    }
    // Non-EUR on-ramp to EVM goes through the modular pipeline
    return [StageKey.InputPlanner, StageKey.Swap, StageKey.Fee, StageKey.Discount, StageKey.Bridge];
  }
}
