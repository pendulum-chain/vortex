import { ALFREDPAY_EVM_TOKEN, EvmToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { assemblePhaseFlow } from "../core/phase-flow";
import type { TokenBrand } from "../core/types";
import { AlfredpayMint } from "../phases/alfredpay-mint";
import { DestinationTransfer } from "../phases/destination-transfer";
import { FinalSettlementSubsidy } from "../phases/final-settlement-subsidy";
import { FundEphemeral } from "../phases/fund-ephemeral";
import { SameChainSquidRouterSwap, SquidRouterPassthrough } from "../phases/squid-router-swap";
import { AlfredpaySubsidizePre } from "../phases/subsidize-pre";

export function makeAlfredpayOnrampDirectFlow<ToToken extends TokenBrand>(toToken: ToToken) {
  const start = FlowBuilder.start(AlfredpayMint)
    .pipe(FundEphemeral(ALFREDPAY_EVM_TOKEN, Networks.Polygon))
    .pipe(AlfredpaySubsidizePre<typeof ALFREDPAY_EVM_TOKEN, typeof Networks.Polygon>());

  if (toToken === ALFREDPAY_EVM_TOKEN) {
    return start
      .pipe(SquidRouterPassthrough(ALFREDPAY_EVM_TOKEN, Networks.Polygon))
      .pipe(FinalSettlementSubsidy<typeof ALFREDPAY_EVM_TOKEN, typeof Networks.Polygon>())
      .pipe(DestinationTransfer<typeof ALFREDPAY_EVM_TOKEN, typeof Networks.Polygon>())
      .build("AlfredpayOnrampDirect");
  }

  return start
    .pipe(SameChainSquidRouterSwap(Networks.Polygon, ALFREDPAY_EVM_TOKEN, toToken))
    .pipe(FinalSettlementSubsidy<ToToken, typeof Networks.Polygon>())
    .pipe(DestinationTransfer<ToToken, typeof Networks.Polygon>())
    .build("AlfredpayOnrampDirect");
}

export const alfredpayOnrampDirectFlow = makeAlfredpayOnrampDirectFlow(EvmToken.USDC);
export const alfredpayOnrampDirectPhaseFlow = assemblePhaseFlow(alfredpayOnrampDirectFlow);
