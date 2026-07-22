import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { fiatRequestIO } from "../core/io";
import { assemblePhaseFlow } from "../core/phase-flow";
import type { TokenBrand } from "../core/types";
import { DestinationTransfer } from "../phases/destination-transfer";
import { DistributeFees } from "../phases/distribute-fees";
import { FundEphemeral } from "../phases/fund-ephemeral";
import { MykoboMint } from "../phases/mykobo-mint";
import { NablaSwap } from "../phases/nabla-swap";
import { SameChainSquidRouterSwap } from "../phases/squid-router-swap";
import { SubsidizePost } from "../phases/subsidize-post";
import { SubsidizePre } from "../phases/subsidize-pre";

function baseSwapFlow() {
  return FlowBuilder.start(fiatRequestIO(FiatToken.EURC), MykoboMint)
    .pipe(FundEphemeral(EvmToken.EURC, Networks.Base))
    .pipe(SubsidizePre<typeof EvmToken.EURC, typeof Networks.Base>())
    .pipe(NablaSwap(Networks.Base, EvmToken.EURC, EvmToken.USDC))
    .pipe(DistributeFees<typeof EvmToken.USDC, typeof Networks.Base>())
    .pipe(SubsidizePost<typeof EvmToken.USDC, typeof Networks.Base>());
}

export const eurOnrampBaseSameChainFlow = baseSwapFlow()
  .pipe(DestinationTransfer<typeof EvmToken.USDC, typeof Networks.Base>())
  .build("EurOnrampBaseSameChain", { isDirectTransfer: false });

export function makeEurOnrampBaseSameChainSwapFlow<ToToken extends TokenBrand>(toToken: ToToken) {
  return baseSwapFlow()
    .pipe(SameChainSquidRouterSwap(Networks.Base, EvmToken.USDC, toToken))
    .pipe(DestinationTransfer<ToToken, typeof Networks.Base>())
    .build("EurOnrampBaseSameChainSwap", { isDirectTransfer: false });
}

export const eurOnrampBaseSameChainSwapFlow = makeEurOnrampBaseSameChainSwapFlow(EvmToken.USDT);
export const eurOnrampBaseSameChainPhaseFlow = assemblePhaseFlow(eurOnrampBaseSameChainFlow);
export const eurOnrampBaseSameChainSwapPhaseFlow = assemblePhaseFlow(eurOnrampBaseSameChainSwapFlow);
