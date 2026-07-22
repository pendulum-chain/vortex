import { EvmNetworks, EvmToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { evmRequestIO } from "../core/io";
import { assemblePhaseFlow } from "../core/phase-flow";
import { AveniaOfframpFee } from "../phases/avenia-offramp-fee";
import { AveniaOfframpPayout } from "../phases/avenia-offramp-payout";
import { DistributeFees } from "../phases/distribute-fees";
import { EvmOfframpSource } from "../phases/evm-offramp-source";
import { NablaSwap } from "../phases/nabla-swap";
import { OfframpSubsidizePost } from "../phases/subsidize-post";
import { SubsidizePre } from "../phases/subsidize-pre";

export function makeBrlOfframpBaseFlow(fromToken: EvmToken, fromNetwork: EvmNetworks) {
  return FlowBuilder.start(evmRequestIO(fromToken, fromNetwork), EvmOfframpSource<EvmToken, EvmNetworks>())
    .pipe(DistributeFees<typeof EvmToken.USDC, typeof Networks.Base>())
    .pipe(SubsidizePre<typeof EvmToken.USDC, typeof Networks.Base>())
    .pipe(NablaSwap(Networks.Base, EvmToken.USDC, EvmToken.BRLA, { cleanup: false }))
    .pipe(AveniaOfframpFee<typeof EvmToken.BRLA, typeof Networks.Base>())
    .pipe(OfframpSubsidizePost<typeof EvmToken.BRLA, typeof Networks.Base>())
    .pipe(AveniaOfframpPayout)
    .build("BrlOfframpBase");
}

export const brlOfframpBaseFlow = makeBrlOfframpBaseFlow(EvmToken.USDC, Networks.Base);
export const brlOfframpBasePhaseFlow = assemblePhaseFlow(brlOfframpBaseFlow);
