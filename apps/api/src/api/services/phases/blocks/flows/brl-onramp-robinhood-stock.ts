import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { fiatRequestIO } from "../core/io";
import { assemblePhaseFlow } from "../core/phase-flow";
import type { StockSymbol } from "../core/robinhood-stocks";
import { AveniaStockMint } from "../phases/avenia-stock-mint";
import { DestinationTransfer } from "../phases/destination-transfer";
import { DistributeFees } from "../phases/distribute-fees";
import { FundEphemeral } from "../phases/fund-ephemeral";
import { GasReserveTopUp } from "../phases/gas-reserve-top-up";
import { NablaSwap } from "../phases/nabla-swap";
import { StockRouteBuy } from "../phases/stock-route";
import { StockSettlement } from "../phases/stock-settlement";
import { SubsidizePost } from "../phases/subsidize-post";
import { SubsidizePre } from "../phases/subsidize-pre";

export function makeBrlOnrampRobinhoodStockFlow<Token extends StockSymbol>(token: Token) {
  return FlowBuilder.start(fiatRequestIO(FiatToken.BRL), AveniaStockMint)
    .pipe(FundEphemeral(EvmToken.BRLA, Networks.Base))
    .pipe(SubsidizePre<typeof EvmToken.BRLA, typeof Networks.Base>())
    .pipe(NablaSwap(Networks.Base, EvmToken.BRLA, EvmToken.USDC))
    .pipe(DistributeFees<typeof EvmToken.USDC, typeof Networks.Base>())
    .pipe(SubsidizePost<typeof EvmToken.USDC, typeof Networks.Base>({ routeValueProbe: false }))
    .pipe(StockRouteBuy(token))
    .pipe(StockSettlement(token))
    .pipe(DestinationTransfer<Token, typeof Networks.Robinhood>())
    .pipe(GasReserveTopUp(token))
    .build("BrlOnrampRobinhoodStock", { isDirectTransfer: false });
}

export const brlOnrampRobinhoodStockFlow = makeBrlOnrampRobinhoodStockFlow(EvmToken.NVDA);
export const brlOnrampRobinhoodStockPhaseFlow = assemblePhaseFlow(brlOnrampRobinhoodStockFlow);
