import { FiatToken } from "@packages/shared";
import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OnRampDiscountEngine } from "../../engines/discount/onramp";
import { OnRampAveniaToEvmFeeEngine } from "../../engines/fee/onramp-brl-to-evm";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampInitializeAveniaEngine } from "../../engines/initialize/onramp-avenia";
import { OnRampInitializeMoneriumEngine } from "../../engines/initialize/onramp-monerium";
import { OnRampSwapEngine } from "../../engines/nabla-swap/onramp";
import { OnRampPendulumTransferEngine } from "../../engines/pendulum/onramp";
import { SpecialOnrampEurEvmEngine } from "../../engines/special-onramp-eur-evm";
import { OnRampSquidRouterBrlToEvmEngine } from "../../engines/squidrouter/onramp-moonbeam-to-evm";

export class OnrampToEvmStrategy implements IRouteStrategy {
  readonly name = "OnRampEvm";

  getStages(ctx: QuoteContext): StageKey[] {
    // EUR special-case handled by dedicated engine
    if (ctx.request.inputCurrency === FiatToken.EURC) {
      return [StageKey.SpecialOnrampEurEvm];
    }
    // Non-EUR on-ramp to EVM goes through the modular pipeline
    return [
      StageKey.OnRampInitialize,
      StageKey.OnRampFee,
      StageKey.OnRampNablaSwap,
      StageKey.OnRampDiscount,
      StageKey.OnRampPendulumTransfer,
      StageKey.OnRampSquidRouter,
      StageKey.OnRampFinalize
    ];
  }

  getEngines(ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.OnRampInitialize]:
        // FIXME, this doesn't make sense while the 'SpecialOnrampEurEvm' engine exists
        ctx.request.inputCurrency === FiatToken.EURC
          ? new OnRampInitializeMoneriumEngine()
          : new OnRampInitializeAveniaEngine(),
      [StageKey.OnRampFee]: new OnRampAveniaToEvmFeeEngine(),
      [StageKey.OnRampNablaSwap]: new OnRampSwapEngine(),
      [StageKey.OnRampDiscount]: new OnRampDiscountEngine(),
      [StageKey.OnRampPendulumTransfer]: new OnRampPendulumTransferEngine(),
      [StageKey.OnRampSquidRouter]: new OnRampSquidRouterBrlToEvmEngine(),
      [StageKey.OnRampFinalize]: new OnRampFinalizeEngine(),

      [StageKey.SpecialOnrampEurEvm]: new SpecialOnrampEurEvmEngine()
    };
  }
}
