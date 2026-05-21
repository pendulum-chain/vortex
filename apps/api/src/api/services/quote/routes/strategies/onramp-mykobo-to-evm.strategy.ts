import { EvmToken, Networks } from "@vortexfi/shared";
import { StageKey } from "../../core/types";
import { OnRampDiscountEngine } from "../../engines/discount/onramp";
import { OnRampMykoboToEvmFeeEngine } from "../../engines/fee/onramp-mykobo-to-evm";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampInitializeMykoboEngine } from "../../engines/initialize/onramp-mykobo";
import { OnRampSwapEngineMykoboEvm } from "../../engines/nabla-swap/onramp-mykobo-evm";
import { OnRampSquidRouterBrlToEvmEngineBase } from "../../engines/squidrouter/onramp-base-to-evm";
import { defineRouteStrategy } from "../route-definition";

export const onrampMykoboToEvmStrategy = defineRouteStrategy({
  engines: () => ({
    [StageKey.Initialize]: new OnRampInitializeMykoboEngine(),
    [StageKey.Fee]: new OnRampMykoboToEvmFeeEngine(Networks.Base, EvmToken.EURC),
    [StageKey.NablaSwap]: new OnRampSwapEngineMykoboEvm(),
    [StageKey.Discount]: new OnRampDiscountEngine(),
    [StageKey.SquidRouter]: new OnRampSquidRouterBrlToEvmEngineBase(),
    [StageKey.Finalize]: new OnRampFinalizeEngine()
  }),
  name: "OnRampMykoboToEvm",
  stages: [StageKey.Initialize, StageKey.Fee, StageKey.NablaSwap, StageKey.Discount, StageKey.SquidRouter, StageKey.Finalize]
});
