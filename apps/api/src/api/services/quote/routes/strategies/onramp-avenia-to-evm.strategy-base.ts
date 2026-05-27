import { EvmToken, Networks } from "@vortexfi/shared";
import { StageKey } from "../../core/types";
import { OnRampDiscountEngine } from "../../engines/discount/onramp";
import { OnRampAveniaToEvmFeeEngine } from "../../engines/fee/onramp-brl-to-evm";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampInitializeAveniaEngine } from "../../engines/initialize/onramp-avenia";
import { OnRampSwapEngineEvm } from "../../engines/nabla-swap/onramp-evm";
import { OnRampSquidRouterToBaseEngine } from "../../engines/squidrouter/onramp-base-to-evm";
import { defineRouteStrategy } from "../route-definition";

export const onrampAveniaToEvmBaseStrategy = defineRouteStrategy({
  engines: () => ({
    [StageKey.Initialize]: new OnRampInitializeAveniaEngine(),
    [StageKey.Fee]: new OnRampAveniaToEvmFeeEngine(Networks.Base, EvmToken.USDC),
    [StageKey.NablaSwap]: new OnRampSwapEngineEvm(),
    [StageKey.Discount]: new OnRampDiscountEngine(),
    [StageKey.SquidRouter]: new OnRampSquidRouterToBaseEngine(),
    [StageKey.Finalize]: new OnRampFinalizeEngine()
  }),
  name: "OnRampAveniaToEvmBase",
  stages: [StageKey.Initialize, StageKey.Fee, StageKey.NablaSwap, StageKey.Discount, StageKey.SquidRouter, StageKey.Finalize]
});
