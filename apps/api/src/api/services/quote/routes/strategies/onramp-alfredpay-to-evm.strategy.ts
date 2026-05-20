import { StageKey } from "../../core/types";
import { OnRampAlfredpayToEvmFeeEngine } from "../../engines/fee/onramp-alfredpay-to-evm";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampInitializeAlfredpayEngine } from "../../engines/initialize/onramp-alfredpay";
import { OnRampSquidRouterUsdToEvmEngine } from "../../engines/squidrouter/onramp-polygon-to-evm-alfredpay";
import { defineRouteStrategy } from "../route-definition";

export const onrampAlfredpayToEvmStrategy = defineRouteStrategy({
  engines: () => ({
    [StageKey.Initialize]: new OnRampInitializeAlfredpayEngine(),
    [StageKey.Fee]: new OnRampAlfredpayToEvmFeeEngine(),
    [StageKey.SquidRouter]: new OnRampSquidRouterUsdToEvmEngine(), // Uses same engine as monerium's. (Polygon ephemeral -> destination)
    [StageKey.Finalize]: new OnRampFinalizeEngine()
  }),
  name: "OnrampAlfredpayToEvm",
  stages: [StageKey.Initialize, StageKey.Fee, StageKey.SquidRouter, StageKey.Finalize]
});
