import { type EvmNetworks, EvmToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { evmRequestIO } from "../core/io";
import { assemblePhaseFlow } from "../core/phase-flow";
import { DistributeFees } from "../phases/distribute-fees";
import { EvmOfframpSource } from "../phases/evm-offramp-source";
import { MykoboOfframpFee } from "../phases/mykobo-offramp-fee";
import { MykoboOfframpPayout } from "../phases/mykobo-offramp-payout";
import { NablaSwap } from "../phases/nabla-swap";
import { OfframpSubsidizePost } from "../phases/subsidize-post";
import { SubsidizePre } from "../phases/subsidize-pre";

export function makeEurOfframpBaseFlow(fromToken: EvmToken, fromNetwork: EvmNetworks) {
  return FlowBuilder.start(evmRequestIO(fromToken, fromNetwork), EvmOfframpSource<EvmToken, EvmNetworks>())
    .pipe(DistributeFees<typeof EvmToken.USDC, typeof Networks.Base>())
    .pipe(SubsidizePre<typeof EvmToken.USDC, typeof Networks.Base>())
    .pipe(NablaSwap(Networks.Base, EvmToken.USDC, EvmToken.EURC, { cleanup: false }))
    .pipe(MykoboOfframpFee<typeof EvmToken.EURC, typeof Networks.Base>())
    .pipe(OfframpSubsidizePost<typeof EvmToken.EURC, typeof Networks.Base>())
    .pipe(MykoboOfframpPayout)
    .build("EurOfframpBase");
}

export const eurOfframpBaseFlow = makeEurOfframpBaseFlow(EvmToken.USDC, Networks.Base);
export const eurOfframpBasePhaseFlow = assemblePhaseFlow(eurOfframpBaseFlow);
