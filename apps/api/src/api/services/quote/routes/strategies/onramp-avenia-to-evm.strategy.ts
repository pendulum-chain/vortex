import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OnRampDiscountEngine } from "../../engines/discount/onramp";
import { OnRampAveniaToEvmFeeEngine } from "../../engines/fee/onramp-brl-to-evm";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampInitializeAveniaEngine } from "../../engines/initialize/onramp-avenia";
import { OnRampSwapEngine } from "../../engines/nabla-swap/onramp";
import { OnRampPendulumTransferEngine } from "../../engines/pendulum-transfers/onramp";
import { OnRampSquidRouterBrlToEvmEngine } from "../../engines/squidrouter/onramp-moonbeam-to-evm";

export class OnrampAveniaToEvmStrategy implements IRouteStrategy {
  readonly name = "OnRampEvm";

  getStages(_ctx: QuoteContext): StageKey[] {
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

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.OnRampInitialize]: new OnRampInitializeAveniaEngine(),
      [StageKey.OnRampFee]: new OnRampAveniaToEvmFeeEngine(),
      [StageKey.OnRampNablaSwap]: new OnRampSwapEngine(),
      [StageKey.OnRampDiscount]: new OnRampDiscountEngine(),
      [StageKey.OnRampPendulumTransfer]: new OnRampPendulumTransferEngine(),
      [StageKey.OnRampSquidRouter]: new OnRampSquidRouterBrlToEvmEngine(),
      [StageKey.OnRampFinalize]: new OnRampFinalizeEngine()
    };
  }
}
