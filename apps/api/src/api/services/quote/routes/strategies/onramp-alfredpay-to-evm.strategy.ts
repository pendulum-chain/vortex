import { StageKey } from "../../core/types";
import { OnRampAlfredpayDiscountEngine } from "../../engines/discount/onramp-alfredpay";
import { OnRampAlfredpayToEvmFeeEngine } from "../../engines/fee/onramp-alfredpay-to-evm";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampInitializeAlfredpayEngine } from "../../engines/initialize/onramp-alfredpay";
import { OnRampSquidRouterUsdToEvmEngine } from "../../engines/squidrouter/onramp-polygon-to-evm-alfredpay";
import { defineRouteStrategy } from "../route-definition";

export const onrampAlfredpayToEvmStrategy = defineRouteStrategy({
  engines: () => ({
    [StageKey.Initialize]: new OnRampInitializeAlfredpayEngine(),
    [StageKey.Fee]: new OnRampAlfredpayToEvmFeeEngine(),
    [StageKey.Discount]: new OnRampAlfredpayDiscountEngine(),
    [StageKey.SquidRouter]: new OnRampSquidRouterUsdToEvmEngine(),
    [StageKey.Finalize]: new OnRampFinalizeEngine()
  }),
  name: "OnrampAlfredpayToEvm",
  stages: [StageKey.Initialize, StageKey.Fee, StageKey.Discount, StageKey.SquidRouter, StageKey.Finalize]
});
