import { StageKey } from "../../core/types";
import { OnRampMoneriumToEvmFeeEngine } from "../../engines/fee/onramp-monerium-to-evm";
import { OnRampFinalizeEngine } from "../../engines/finalize/onramp";
import { OnRampInitializeMoneriumEngine } from "../../engines/initialize/onramp-monerium";
import { OnRampSquidRouterEurToEvmEngine } from "../../engines/squidrouter/onramp-polygon-to-evm";
import { defineRouteStrategy } from "../route-definition";

export const onrampMoneriumToEvmStrategy = defineRouteStrategy({
  engines: () => ({
    [StageKey.Initialize]: new OnRampInitializeMoneriumEngine(),
    [StageKey.Fee]: new OnRampMoneriumToEvmFeeEngine(),
    [StageKey.SquidRouter]: new OnRampSquidRouterEurToEvmEngine(),
    [StageKey.Finalize]: new OnRampFinalizeEngine()
  }),
  name: "OnRampMoneriumToEvm",
  stages: [StageKey.Initialize, StageKey.Fee, StageKey.SquidRouter, StageKey.Finalize]
});
