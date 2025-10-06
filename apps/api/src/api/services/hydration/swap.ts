import { EvmClient, PoolService, Trade, TradeRouter, TxBuilderFactory } from "@galacticcouncil/sdk";
import { ApiManager } from "@packages/shared";

export class HydrationRouter {
  private _tradeRouter?: TradeRouter;
  private _poolService?: PoolService;
  private _evmClient?: EvmClient;
  private _txBuilderFactory?: TxBuilderFactory;

  private readonly initPromise: Promise<void>;

  constructor() {
    const apiManager = ApiManager.getInstance();
    this.initPromise = apiManager.getApi("hydration").then(({ api }) => {
      const evmClient = new EvmClient(api);
      this._evmClient = evmClient;

      const poolService = new PoolService(api, evmClient);
      this._poolService = poolService;

      const tradeRouter = new TradeRouter(poolService);
      this._tradeRouter = tradeRouter;

      // Fire-and-forget; router can still serve while registry syncs
      void poolService.syncRegistry();

      this._txBuilderFactory = new TxBuilderFactory(api, evmClient);

      console.log("Constructed HydrationRouter");
    });
  }

  // Expose readiness for callers that want to await initialization during bootstrap
  ready(): Promise<void> {
    return this.initPromise;
  }

  // Guarded accessors keep method signatures clean and fail fast if used too early
  private get tradeRouter(): TradeRouter {
    if (!this._tradeRouter) throw new Error("HydrationRouter not initialized yet");
    return this._tradeRouter;
  }

  private get txBuilderFactory(): TxBuilderFactory {
    if (!this._txBuilderFactory) throw new Error("HydrationRouter not initialized yet");
    return this._txBuilderFactory;
  }

  async getBestSellPriceFor(assetIn: string, assetOut: string, amountIn: string) {
    return await this.tradeRouter.getBestSell(assetIn, assetOut, amountIn);
  }

  async createTransactionForTrade(trade: Trade, beneficiaryAddress: string, slippage = 0.5) {
    const txBuilder = this.txBuilderFactory.trade(trade);
    txBuilder.withBeneficiary(beneficiaryAddress);
    txBuilder.withSlippage(slippage);

    return await txBuilder.build();
  }
}

const hydrationRouter = new HydrationRouter();
export default hydrationRouter;
