import { FiatToken } from "@packages/shared";
import { IRouteStrategy, QuoteContext, StageKey } from "../../types";

// PR2: On-ramp to EVM strategy
// For PR2 we only enable the special-case EUR on-ramp to EVM stage to preserve behavior.
export class OnRampEvmStrategy implements IRouteStrategy {
  readonly name = "OnRampEvm";

  getStages(ctx: QuoteContext): StageKey[] {
    // Only handle the EUR special-case here in PR2. Other flows remain in index.ts.
    if (ctx.request.inputCurrency === FiatToken.EURC) {
      return [StageKey.SpecialOnrampEurEvm];
    }
    return [];
  }
}
