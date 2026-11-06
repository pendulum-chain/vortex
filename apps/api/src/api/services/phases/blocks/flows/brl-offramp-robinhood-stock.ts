import { EvmToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { evmRequestIO } from "../core/io";
import { assemblePhaseFlow } from "../core/phase-flow";
import type { StockSymbol } from "../core/robinhood-stocks";
import { AveniaOfframpFee } from "../phases/avenia-offramp-fee";
import { AveniaOfframpPayout } from "../phases/avenia-offramp-payout";
import { DistributeFees } from "../phases/distribute-fees";
import { FundEphemeral } from "../phases/fund-ephemeral";
import { NablaSwap } from "../phases/nabla-swap";
import { StockPermitSource } from "../phases/stock-permit-source";
import { StockRouteSell } from "../phases/stock-route";
import { OfframpSubsidizePost } from "../phases/subsidize-post";
import { SubsidizePre } from "../phases/subsidize-pre";

export function makeBrlOfframpRobinhoodStockFlow<Token extends StockSymbol>(token: Token) {
  return FlowBuilder.start(evmRequestIO(token, Networks.Robinhood), FundEphemeral(token, Networks.Robinhood))
    .pipe(StockPermitSource(token))
    .pipe(StockRouteSell(token))
    .pipe(DistributeFees<typeof EvmToken.USDC, typeof Networks.Base>())
    .pipe(SubsidizePre<typeof EvmToken.USDC, typeof Networks.Base>())
    .pipe(NablaSwap(Networks.Base, EvmToken.USDC, EvmToken.BRLA, { cleanup: false }))
    .pipe(AveniaOfframpFee<typeof EvmToken.BRLA, typeof Networks.Base>())
    .pipe(OfframpSubsidizePost<typeof EvmToken.BRLA, typeof Networks.Base>())
    .pipe(AveniaOfframpPayout)
    .build("BrlOfframpRobinhoodStock");
}

export const brlOfframpRobinhoodStockFlow = makeBrlOfframpRobinhoodStockFlow(EvmToken.NVDA);
export const brlOfframpRobinhoodStockPhaseFlow = assemblePhaseFlow(brlOfframpRobinhoodStockFlow);
