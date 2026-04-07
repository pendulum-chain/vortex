import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OnRampDiscountEngine } from "../../engines/discount/onramp";
import { OnRampAveniaToEvmFeeEngine } from "../../engines/fee/onramp-brl-to-evm";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampInitializeAveniaEngine } from "../../engines/initialize/onramp-avenia";
import { OnRampSwapEngine } from "../../engines/nabla-swap/onramp";
import { OnRampPendulumTransferEngine } from "../../engines/pendulum-transfers/onramp";
import { OnRampSquidRouterBrlToEvmEngineBase } from "../../engines/squidrouter/onramp-base-to-evm";

export class OnrampAveniaToEvmStrategy implements IRouteStrategy {
  readonly name = "OnRampAveniaToEvm";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [StageKey.Initialize, StageKey.Fee, StageKey.NablaSwap, StageKey.Discount, StageKey.SquidRouter, StageKey.Finalize];
  }

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.Initialize]: new OnRampInitializeAveniaEngine(),
      [StageKey.NablaSwap]: new OnRampSquidRouterBrlToEvmEngineBase(), // TODO check. Can we use the same as we use on Pendulum?
      [StageKey.Discount]: new OnRampDiscountEngine(),
      [StageKey.Finalize]: new OnRampFinalizeEngine()
    };
  }
}
