import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { fiatRequestIO } from "../core/io";
import { assemblePhaseFlow } from "../core/phase-flow";
import type { TokenBrand } from "../core/types";
import { AveniaMint } from "../phases/avenia-mint";
import { DestinationTransfer } from "../phases/destination-transfer";
import { DistributeFees } from "../phases/distribute-fees";
import { FundEphemeral } from "../phases/fund-ephemeral";
import { NablaSwap } from "../phases/nabla-swap";
import { SameChainSquidRouterSwap } from "../phases/squid-router-swap";
import { SubsidizePost } from "../phases/subsidize-post";
import { SubsidizePre } from "../phases/subsidize-pre";

function baseSwapFlow() {
  return FlowBuilder.start(fiatRequestIO(FiatToken.BRL), AveniaMint)
    .pipe(FundEphemeral(EvmToken.BRLA, Networks.Base))
    .pipe(SubsidizePre<typeof EvmToken.BRLA, typeof Networks.Base>())
    .pipe(NablaSwap(Networks.Base, EvmToken.BRLA, EvmToken.USDC))
    .pipe(DistributeFees<typeof EvmToken.USDC, typeof Networks.Base>())
    .pipe(SubsidizePost<typeof EvmToken.USDC, typeof Networks.Base>());
}

export const brlOnrampBaseSameChainFlow = baseSwapFlow()
  .pipe(DestinationTransfer<typeof EvmToken.USDC, typeof Networks.Base>())
  .build("BrlOnrampBaseSameChain", { isDirectTransfer: false });

export function makeBrlOnrampBaseSameChainSwapFlow<ToToken extends TokenBrand>(toToken: ToToken) {
  return baseSwapFlow()
    .pipe(SameChainSquidRouterSwap(Networks.Base, EvmToken.USDC, toToken))
    .pipe(DestinationTransfer<ToToken, typeof Networks.Base>())
    .build("BrlOnrampBaseSameChainSwap", { isDirectTransfer: false });
}

export const brlOnrampBaseSameChainSwapFlow = makeBrlOnrampBaseSameChainSwapFlow(EvmToken.USDT);
export const brlOnrampBaseSameChainPhaseFlow = assemblePhaseFlow(brlOnrampBaseSameChainFlow);
export const brlOnrampBaseSameChainSwapPhaseFlow = assemblePhaseFlow(brlOnrampBaseSameChainSwapFlow);
