import type { EvmToken, Networks } from "@vortexfi/shared";
import { assertStockTradable, type StockSymbol } from "../../core/robinhood-stocks";
import type { Phase, PhaseIO, RegistrationResult } from "../../core/types";
import { UniswapApproveExecutor, UniswapSwapExecutor } from "../uniswap-v3-fixed-swap/execution";
import { RelayBridgeExecutor } from "./execution";
import { StockRouteContext, type StockRouteMetadata, simulateStockRouteBuy, simulateStockRouteSell } from "./simulation";
import { prepareStockRouteBuyTxs, prepareStockRouteSellTxs, type StockRouteFacts } from "./transactions";

async function registerStockRoute(token: StockSymbol): Promise<RegistrationResult<StockRouteFacts, StockRouteMetadata>> {
  await assertStockTradable(token);
  return { facts: {} };
}

export function StockRouteBuy<Token extends StockSymbol>(
  token: Token
): Phase<
  typeof StockRouteContext,
  PhaseIO<typeof EvmToken.USDC, typeof Networks.Base>,
  PhaseIO<Token, typeof Networks.Robinhood>,
  StockRouteFacts
> {
  return {
    context: StockRouteContext,
    executors: [new RelayBridgeExecutor(), new UniswapApproveExecutor(), new UniswapSwapExecutor()],
    name: `StockRouteBuy(${token})`,
    phases: ["relayBridge", "uniswapApprove", "uniswapSwap"],
    prepareTxs: prepareStockRouteBuyTxs,
    register: () => registerStockRoute(token),
    simulate: (input, ctx) => simulateStockRouteBuy(token, input, ctx)
  };
}

export function StockRouteSell<Token extends StockSymbol>(
  token: Token
): Phase<
  typeof StockRouteContext,
  PhaseIO<Token, typeof Networks.Robinhood>,
  PhaseIO<typeof EvmToken.USDC, typeof Networks.Base>,
  StockRouteFacts
> {
  return {
    context: StockRouteContext,
    executors: [new UniswapApproveExecutor(), new UniswapSwapExecutor(), new RelayBridgeExecutor()],
    name: `StockRouteSell(${token})`,
    phases: ["uniswapApprove", "uniswapSwap", "relayBridge"],
    prepareTxs: prepareStockRouteSellTxs,
    register: () => registerStockRoute(token),
    simulate: (input, ctx) => simulateStockRouteSell(token, input, ctx)
  };
}
