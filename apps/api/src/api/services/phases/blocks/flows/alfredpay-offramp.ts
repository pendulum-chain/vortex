import { type EvmNetworks, EvmToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { evmRequestIO } from "../core/io";
import { AlfredpayOfframp } from "../phases/alfredpay-offramp";

export function makeAlfredpayOfframpFlow(fromToken: EvmToken, fromNetwork: EvmNetworks) {
  return FlowBuilder.start(evmRequestIO(fromToken, fromNetwork), AlfredpayOfframp(fromToken, fromNetwork)).build(
    "AlfredpayOfframp"
  );
}

export const alfredpayOfframpFlow = makeAlfredpayOfframpFlow(EvmToken.USDC, Networks.Base);
