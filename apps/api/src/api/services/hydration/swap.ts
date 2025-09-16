import { EvmClient, PoolService, Trade, TradeRouter } from "@galacticcouncil/sdk";
import { TradeTxBuilder } from "@galacticcouncil/sdk/build/types/tx/TradeTxBuilder";
import { ApiManager } from "@packages/shared";

export async function getBestSellPriceFor(assetIn: string, assetOut: string, amountIn: string) {
  const apiManager = ApiManager.getInstance();
  const { api } = await apiManager.getApi("hydration");
  const evmClient = new EvmClient(api);

  const poolService = new PoolService(api, evmClient);
  const tradeRouter = new TradeRouter(poolService);

  // Get trade routes
  const routes = await tradeRouter.getRoutes(assetIn, assetOut);

  console.log("Available trade routes:", routes);

  // Calculate spot price
  const bestSellTrade = await tradeRouter.getBestSell(assetIn, assetOut, amountIn);

  return bestSellTrade;
}

export async function createTransactionForTrade(trade: Trade, beneficiaryAddress: string, slippage = 0.5) {
  const apiManager = ApiManager.getInstance();
  const { api } = await apiManager.getApi("hydration");
  const evmClient = new EvmClient(api);

  const txBuilder = new TradeTxBuilder(api, evmClient);
  txBuilder.setTrade(trade);
  txBuilder.withBeneficiary(beneficiaryAddress);
  txBuilder.withSlippage(slippage);

  return await txBuilder.build();
}
