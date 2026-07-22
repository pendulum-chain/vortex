import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { fiatRequestIO } from "../core/io";
import { assemblePhaseFlow } from "../core/phase-flow";
import type { ChainBrand, TokenBrand } from "../core/types";
import { DestinationTransfer } from "../phases/destination-transfer";
import { DistributeFees } from "../phases/distribute-fees";
import { FinalSettlementSubsidy } from "../phases/final-settlement-subsidy";
import { FundEphemeral } from "../phases/fund-ephemeral";
import { MykoboMint } from "../phases/mykobo-mint";
import { NablaSwap } from "../phases/nabla-swap";
import { SquidRouterSwap } from "../phases/squid-router-swap";
import { SubsidizePost } from "../phases/subsidize-post";
import { SubsidizePre } from "../phases/subsidize-pre";

export function makeEurOnrampBaseCrossChainFlow<ToChain extends ChainBrand, ToToken extends TokenBrand>(
  toChain: ToChain,
  toToken: ToToken
) {
  return FlowBuilder.start(fiatRequestIO(FiatToken.EURC), MykoboMint)
    .pipe(FundEphemeral(EvmToken.EURC, Networks.Base))
    .pipe(SubsidizePre<typeof EvmToken.EURC, typeof Networks.Base>())
    .pipe(NablaSwap(Networks.Base, EvmToken.EURC, EvmToken.USDC))
    .pipe(DistributeFees<typeof EvmToken.USDC, typeof Networks.Base>())
    .pipe(SubsidizePost<typeof EvmToken.USDC, typeof Networks.Base>())
    .pipe(SquidRouterSwap(Networks.Base, toChain, EvmToken.USDC, toToken))
    .pipe(FinalSettlementSubsidy<ToToken, ToChain>())
    .pipe(DestinationTransfer<ToToken, ToChain>())
    .build("EurOnrampBaseCrossChain", { isDirectTransfer: false });
}

export const eurOnrampBaseCrossChainFlow = makeEurOnrampBaseCrossChainFlow(Networks.Arbitrum, EvmToken.USDC);
export const eurOnrampBaseCrossChainPhaseFlow = assemblePhaseFlow(eurOnrampBaseCrossChainFlow);
