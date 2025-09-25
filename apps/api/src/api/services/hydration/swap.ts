import { EvmClient, PoolService, Trade, TradeRouter, TxBuilderFactory } from "@galacticcouncil/sdk";
import { ApiManager } from "@packages/shared";

export async function getBestSellPriceFor(assetIn: string, assetOut: string, amountIn: string) {
  const apiManager = ApiManager.getInstance();
  const { api } = await apiManager.getApi("hydration");
  const evmClient = new EvmClient(api);

  const poolService = new PoolService(api, evmClient);
  const tradeRouter = new TradeRouter(poolService);
  await poolService.syncRegistry();

  // Calculate spot price
  return await tradeRouter.getBestSell(assetIn, assetOut, amountIn);
}

export async function createTransactionForTrade(trade: Trade, beneficiaryAddress: string, slippage = 0.5) {
  const apiManager = ApiManager.getInstance();
  const { api } = await apiManager.getApi("hydration");
  const evmClient = new EvmClient(api);

  const txBuilder = new TxBuilderFactory(api, evmClient).trade(trade);
  txBuilder.withBeneficiary(beneficiaryAddress);
  txBuilder.withSlippage(slippage);

  return await txBuilder.build();
}
