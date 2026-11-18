import { EvmToken, Networks } from "@vortexfi/shared";
import Big from "big.js";
import { parseUnits } from "viem";
import { FlowBuilder } from "../core/flow";
import { evmIO, evmRequestIO } from "../core/io";
import { assemblePhaseFlow } from "../core/phase-flow";
import type { StockSymbol } from "../core/robinhood-stocks";
import type { PhaseCtx } from "../core/types";
import { DestinationTransfer } from "../phases/destination-transfer";
import { DistributeFees } from "../phases/distribute-fees";
import { FundEphemeral } from "../phases/fund-ephemeral";
import { GasReserveTopUp } from "../phases/gas-reserve-top-up";
import { BaseUsdcStockSource, StockPermitSource } from "../phases/stock-permit-source";
import { StockRouteBuy, StockRouteSell } from "../phases/stock-route";
import { StockSettlement } from "../phases/stock-settlement";
import { SubsidizePre } from "../phases/subsidize-pre";

const source = (ctx: PhaseCtx) =>
  evmIO(EvmToken.USDC, Networks.Base, new Big(ctx.request.inputAmount), parseUnits(ctx.request.inputAmount, 6).toString());

export function makeBaseUsdcStockBuyFlow<Token extends StockSymbol>(token: Token) {
  return FlowBuilder.start(source, FundEphemeral(EvmToken.USDC, Networks.Base))
    .pipe(BaseUsdcStockSource())
    .pipe(DistributeFees<typeof EvmToken.USDC, typeof Networks.Base>())
    .pipe(StockRouteBuy(token))
    .pipe(StockSettlement(token))
    .pipe(DestinationTransfer<Token, typeof Networks.Robinhood>())
    .pipe(GasReserveTopUp(token))
    .build("BaseUsdcStockBuy", { isDirectTransfer: false });
}

export function makeBaseUsdcStockSellFlow<Token extends StockSymbol>(token: Token) {
  return FlowBuilder.start(evmRequestIO(token, Networks.Robinhood), FundEphemeral(token, Networks.Robinhood))
    .pipe(StockPermitSource(token))
    .pipe(StockRouteSell(token))
    .pipe(DistributeFees<typeof EvmToken.USDC, typeof Networks.Base>())
    .pipe(SubsidizePre<typeof EvmToken.USDC, typeof Networks.Base>())
    .pipe(DestinationTransfer<typeof EvmToken.USDC, typeof Networks.Base>())
    .build("BaseUsdcStockSell", { isDirectTransfer: false });
}

export const baseUsdcStockBuyFlow = makeBaseUsdcStockBuyFlow(EvmToken.NVDA);
export const baseUsdcStockSellFlow = makeBaseUsdcStockSellFlow(EvmToken.NVDA);
export const baseUsdcStockBuyPhaseFlow = assemblePhaseFlow(baseUsdcStockBuyFlow);
export const baseUsdcStockSellPhaseFlow = assemblePhaseFlow(baseUsdcStockSellFlow);
