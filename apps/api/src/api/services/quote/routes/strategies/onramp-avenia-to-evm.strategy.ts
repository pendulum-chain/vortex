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
      StageKey.Initialize,
      StageKey.Fee,
      StageKey.NablaSwap,
      StageKey.Discount,
      StageKey.PendulumTransfer,
      StageKey.SquidRouter,
      StageKey.Finalize
    ];
  }

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.Initialize]: new OnRampInitializeAveniaEngine(),
      [StageKey.Fee]: new OnRampAveniaToEvmFeeEngine(),
      [StageKey.NablaSwap]: new OnRampSwapEngine(),
      [StageKey.Discount]: new OnRampDiscountEngine(),
      [StageKey.PendulumTransfer]: new OnRampPendulumTransferEngine(),
      [StageKey.SquidRouter]: new OnRampSquidRouterBrlToEvmEngine(),
      [StageKey.Finalize]: new OnRampFinalizeEngine()
    };
  }
}
