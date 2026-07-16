import { EvmToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { assemblePhaseFlow } from "../core/phase-flow";
import type { ChainBrand, Flow, TokenBrand } from "../core/types";
import { AveniaMint } from "../phases/avenia-mint";
import { DestinationTransfer } from "../phases/destination-transfer";
import { DistributeFees } from "../phases/distribute-fees";
import { FinalSettlementSubsidy } from "../phases/final-settlement-subsidy";
import { FundEphemeral } from "../phases/fund-ephemeral";
import { NablaSwap } from "../phases/nabla-swap";
import { SquidRouterSwap } from "../phases/squid-router-swap";
import { SubsidizePost } from "../phases/subsidize-post";
import { SubsidizePre } from "../phases/subsidize-pre";

// The destination chain/token vary per request (quote.to / quote.outputCurrency), so the corridor
// is a flow family: one factory, one flow instance per destination. The RampPhase[] shape is
// identical for every destination.
export function makeBrlOnrampBaseCrossChainFlow<ToChain extends ChainBrand, ToToken extends TokenBrand>(
  toChain: ToChain,
  toToken: ToToken
): Flow {
  return FlowBuilder.start(AveniaMint)
    .pipe(FundEphemeral(EvmToken.BRLA, Networks.Base))
    .pipe(SubsidizePre<typeof EvmToken.BRLA, typeof Networks.Base>())
    .pipe(NablaSwap(Networks.Base, EvmToken.BRLA, EvmToken.USDC))
    .pipe(DistributeFees<typeof EvmToken.USDC, typeof Networks.Base>())
    .pipe(SubsidizePost<typeof EvmToken.USDC, typeof Networks.Base>())
    .pipe(SquidRouterSwap(Networks.Base, toChain, EvmToken.USDC, toToken))
    .pipe(FinalSettlementSubsidy<ToToken, ToChain>())
    .pipe(DestinationTransfer<ToToken, ToChain>())
    .build("BrlOnrampBaseCrossChain", { isDirectTransfer: false });
}

export const brlOnrampBaseCrossChainFlow: Flow = makeBrlOnrampBaseCrossChainFlow(Networks.Arbitrum, EvmToken.USDC);
export const brlOnrampBaseCrossChainPhaseFlow = assemblePhaseFlow(brlOnrampBaseCrossChainFlow);
