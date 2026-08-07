import { ALFREDPAY_EVM_TOKEN, type EvmNetworks, EvmToken, type FiatToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { evmRequestIO } from "../core/io";
import { AlfredpayOfframp } from "../phases/alfredpay-offramp";
import { DistributeFees } from "../phases/distribute-fees";

// Version 2 appends the Polygon fee-collection phase: the vortex/partner fee residual
// that AlfredpayOfframp's pricing reserves on the Polygon ephemeral is paid out after
// the Alfredpay deposit succeeded. Deploys are gated on draining v1 quotes/ramps.
export const ALFREDPAY_OFFRAMP_FLOW_VERSION = 3;

export function makeAlfredpayOfframpFlow(fromToken: EvmToken, fromNetwork: EvmNetworks) {
  return FlowBuilder.start(evmRequestIO(fromToken, fromNetwork), AlfredpayOfframp(fromToken, fromNetwork))
    .pipe(
      DistributeFees<FiatToken, "fiat">({
        deductFromAmount: false,
        feeToken: ALFREDPAY_EVM_TOKEN,
        network: Networks.Polygon as EvmNetworks
      })
    )
    .build("AlfredpayOfframp", {}, ALFREDPAY_OFFRAMP_FLOW_VERSION);
}

export const alfredpayOfframpFlow = makeAlfredpayOfframpFlow(EvmToken.USDC, Networks.Base);
