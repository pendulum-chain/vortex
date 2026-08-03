import { ALFREDPAY_EVM_TOKEN, EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { fiatRequestIO } from "../core/io";
import { assemblePhaseFlow } from "../core/phase-flow";
import type { ChainBrand, TokenBrand } from "../core/types";
import { AlfredpayMint } from "../phases/alfredpay-mint";
import { DestinationTransfer } from "../phases/destination-transfer";
import { FinalSettlementSubsidy } from "../phases/final-settlement-subsidy";
import { FundEphemeral } from "../phases/fund-ephemeral";
import { SquidRouterSwap } from "../phases/squid-router-swap";
import { AlfredpaySubsidizePre } from "../phases/subsidize-pre";

export function makeAlfredpayOnrampCrossChainFlow<ToChain extends ChainBrand, ToToken extends TokenBrand>(
  toChain: ToChain,
  toToken: ToToken
) {
  return FlowBuilder.start(fiatRequestIO(FiatToken.ARS, FiatToken.COP, FiatToken.MXN, FiatToken.USD), AlfredpayMint)
    .pipe(FundEphemeral(ALFREDPAY_EVM_TOKEN, Networks.Polygon))
    .pipe(AlfredpaySubsidizePre<typeof ALFREDPAY_EVM_TOKEN, typeof Networks.Polygon>())
    .pipe(SquidRouterSwap(Networks.Polygon, toChain, ALFREDPAY_EVM_TOKEN, toToken))
    .pipe(FinalSettlementSubsidy<ToToken, ToChain>())
    .pipe(DestinationTransfer<ToToken, ToChain>())
    .build("AlfredpayOnrampCrossChain", { isDirectTransfer: false });
}

export const alfredpayOnrampCrossChainFlow = makeAlfredpayOnrampCrossChainFlow(Networks.Arbitrum, EvmToken.USDC);
export const alfredpayOnrampCrossChainPhaseFlow = assemblePhaseFlow(alfredpayOnrampCrossChainFlow);
