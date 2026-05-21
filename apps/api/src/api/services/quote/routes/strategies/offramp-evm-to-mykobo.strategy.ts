import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OffRampDiscountEngine } from "../../engines/discount/offramp";
import { OffRampEvmToMykoboFeeEngine } from "../../engines/fee/offramp-evm-to-mykobo";
import { OffRampFinalizeEngine } from "../../engines/finalize/offramp";
import { OffRampInitializeMykoboEngine } from "../../engines/initialize/offramp-mykobo";

export class OfframpEvmToMykoboStrategy implements IRouteStrategy {
  readonly name = "OffRampEvmToMykobo";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [StageKey.Initialize, StageKey.Fee, StageKey.Discount, StageKey.Finalize];
  }

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.Initialize]: new OffRampInitializeMykoboEngine(),
      [StageKey.Fee]: new OffRampEvmToMykoboFeeEngine(),
      [StageKey.Discount]: new OffRampDiscountEngine(),
      [StageKey.Finalize]: new OffRampFinalizeEngine()
    };
  }
}
