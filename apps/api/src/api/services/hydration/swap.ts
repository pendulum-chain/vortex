import { EvmClient, PoolService, Trade, TradeRouter, TxBuilderFactory } from "@galacticcouncil/sdk";
import { ApiManager } from "@packages/shared";

export class HydrationRouter {
  private tradeRouter: TradeRouter;
  private poolService: PoolService;
  private evmClient: EvmClient;
  private txBuilderFactory: TxBuilderFactory;

  constructor() {
    const apiManager = ApiManager.getInstance();
    apiManager.getApi("hydration").then(({ api }) => {
      const evmClient = new EvmClient(api);
      this.evmClient = evmClient;

      this.poolService = new PoolService(api, evmClient);
      this.tradeRouter = new TradeRouter(this.poolService);
      this.poolService.syncRegistry();

      this.txBuilderFactory = new TxBuilderFactory(api, evmClient);

      console.log("Constructed HydrationRouter");
    });
  }
  async getBestSellPriceFor(assetIn: string, assetOut: string, amountIn: string) {
    // Calculate spot price
    return await this.tradeRouter.getBestSell(assetIn, assetOut, amountIn);
  }

  async createTransactionForTrade(trade: Trade, beneficiaryAddress: string, slippage = 0.5) {
    const txBuilder = this.txBuilderFactory.trade(trade);
    txBuilder.withBeneficiary(beneficiaryAddress);
    txBuilder.withSlippage(slippage);

    return await txBuilder.build();
  }
}

export default new HydrationRouter();
