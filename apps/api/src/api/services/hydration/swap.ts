import { createSdkContext, PoolType, SdkCtx, Trade } from "@galacticcouncil/sdk";
import { ApiManager } from "@packages/shared";

export class HydrationRouter {
  private sdk: Promise<SdkCtx>;

  constructor() {
    const apiManager = ApiManager.getInstance();
    this.sdk = apiManager.getApi("hydration").then(async ({ api }) => {
      return createSdkContext(api, { router: { includeOnly: [PoolType.Omni, PoolType.Stable] } });
    });
  }

  async getBestSellPriceFor(assetIn: string, assetOut: string, amountIn: string) {
    const sdk = await this.sdk;
    return sdk.api.router.getBestSell(assetIn, assetOut, amountIn);
  }

  async createTransactionForTrade(trade: Trade, beneficiaryAddress: string, slippage = 0.1) {
    const sdk = await this.sdk;
    const txBuilder = sdk.tx.trade(trade);
    txBuilder.withBeneficiary(beneficiaryAddress);
    txBuilder.withSlippage(slippage);

    return await txBuilder.build();
  }
}

const hydrationRouter = new HydrationRouter();
export default hydrationRouter;
