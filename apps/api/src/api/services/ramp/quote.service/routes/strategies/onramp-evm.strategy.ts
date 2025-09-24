import { FiatToken } from "@packages/shared";
import { OnRampFeeEngine } from "../../engines/fee/onramp";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampInitializeEngine } from "../../engines/initialize/onramp";
import { OnRampSwapEngine } from "../../engines/nabla-swap/onramp";
import { SpecialOnrampEurEvmEngine } from "../../engines/special-onramp-eur-evm";
import { OnRampSquidRouterToEvmEngine } from "../../engines/squidrouter/onramp-to-evm";
import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../types";

export class OnRampEvmStrategy implements IRouteStrategy {
  readonly name = "OnRampEvm";

  getStages(ctx: QuoteContext): StageKey[] {
    // EUR special-case handled by dedicated engine
    if (ctx.request.inputCurrency === FiatToken.EURC) {
      return [StageKey.SpecialOnrampEurEvm];
    }
    // Non-EUR on-ramp to EVM goes through the modular pipeline
    return [
      StageKey.OnRampInitialize,
      StageKey.OnRampSwap,
      StageKey.OnRampFee,
      StageKey.OnRampDiscount,
      StageKey.OnRampSquidRouter,
      StageKey.OnRampFinalize
    ];
  }

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.OnRampInitialize]: new OnRampInitializeEngine(),
      [StageKey.OnRampSwap]: new OnRampSwapEngine(),
      [StageKey.OnRampFee]: new OnRampFeeEngine(),
      [StageKey.OnRampDiscount]: new OnRampFeeEngine(),
      [StageKey.OnRampSquidRouter]: new OnRampSquidRouterToEvmEngine(),
      [StageKey.OnRampFinalize]: new OnRampFinalizeEngine(),

      [StageKey.SpecialOnrampEurEvm]: new SpecialOnrampEurEvmEngine()
    };
  }
}
