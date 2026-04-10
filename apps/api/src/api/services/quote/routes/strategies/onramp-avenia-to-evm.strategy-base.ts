import { EvmToken, Networks } from "@vortexfi/shared";
import { EnginesRegistry, IRouteStrategy, QuoteContext, StageKey } from "../../core/types";
import { OnRampDiscountEngine } from "../../engines/discount/onramp";
import { OnRampAveniaToEvmFeeEngine } from "../../engines/fee/onramp-brl-to-evm";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampInitializeAveniaEngine } from "../../engines/initialize/onramp-avenia";
import { OnRampSwapEngineEvm } from "../../engines/nabla-swap/onramp-evm";
import { OnRampSquidRouterBrlToEvmEngineBase } from "../../engines/squidrouter/onramp-base-to-evm";

export class OnrampAveniaToEvmBaseStrategy implements IRouteStrategy {
  readonly name = "OnRampAveniaToEvmBase";

  getStages(_ctx: QuoteContext): StageKey[] {
    return [StageKey.Initialize, StageKey.Fee, StageKey.NablaSwap, StageKey.Discount, StageKey.SquidRouter, StageKey.Finalize];
  }

  getEngines(_ctx: QuoteContext): EnginesRegistry {
    return {
      [StageKey.Initialize]: new OnRampInitializeAveniaEngine(),
      [StageKey.Fee]: new OnRampAveniaToEvmFeeEngine(Networks.Base, EvmToken.USDC),
      [StageKey.NablaSwap]: new OnRampSwapEngineEvm(),
      [StageKey.Discount]: new OnRampDiscountEngine(),
      [StageKey.SquidRouter]: new OnRampSquidRouterBrlToEvmEngineBase(),
      [StageKey.Finalize]: new OnRampFinalizeEngine()
    };
  }
}
