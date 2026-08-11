import { ALFREDPAY_EVM_TOKEN, type EvmNetworks, EvmToken, type FiatToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { evmRequestIO } from "../core/io";
import { AlfredpayOfframp } from "../phases/alfredpay-offramp";
import { DistributeFees } from "../phases/distribute-fees";

// Version 4 introduces context schema 3 and persists Squid's executable minimum for
// provider-aware target-discount/cap reconciliation. Deployments must be timed for
// a window with no pending AlfredPay quotes or ramps from flow v3.
export const ALFREDPAY_OFFRAMP_FLOW_VERSION = 4;

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
