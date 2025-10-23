import { createSdkContext, PoolType, SdkCtx, SubstrateTransaction, Trade } from "@galacticcouncil/sdk";
import { ApiManager, assethubTokenConfig, multiplyByPowerOfTen, XcmFees } from "@packages/shared";
import { Builder } from "@paraspell/sdk-pjs";
import logger from "../../../config/logger";

/// The IDs of the Hydration assets for which the XCM fees are cached
const CACHED_ASSET_IDS = [
  assethubTokenConfig.USDC.hydrationId,
  assethubTokenConfig.DOT.hydrationId,
  assethubTokenConfig.USDT.hydrationId
];

export class HydrationRouter {
  private sdk: Promise<SdkCtx>;
  private cachedXcmFees: Record<string, XcmFees>;

  constructor() {
    const apiManager = ApiManager.getInstance();
    this.cachedXcmFees = {};
    this.sdk = apiManager.getApi("hydration").then(async ({ api }) => {
      return createSdkContext(api, { router: { includeOnly: [PoolType.Omni, PoolType.Stable] } });
    });

    // Refresh transaction fees every hour
    void this.refreshCachedXcmTransactionFeeToAssethub();
    setInterval(this.refreshCachedXcmTransactionFeeToAssethub, 60 * 60 * 1000);
  }

  async getBestSellPriceFor(assetIn: string, assetOut: string, amountIn: string): Promise<Trade> {
    const sdk = await this.sdk;
    return sdk.api.router.getBestSell(assetIn, assetOut, amountIn);
  }

  async createTransactionForTrade(trade: Trade, beneficiaryAddress: string, slippage = 0.1): Promise<SubstrateTransaction> {
    const sdk = await this.sdk;
    const txBuilder = sdk.tx.trade(trade);
    txBuilder.withBeneficiary(beneficiaryAddress);
    txBuilder.withSlippage(slippage);

    return await txBuilder.build();
  }

  async getXcmTransactionFeeToAssethub(assetId: string) {
    if (this.cachedXcmFees[assetId]) {
      return this.cachedXcmFees[assetId];
    } else {
      await this.refreshCachedXcmTransactionFeeToAssethub();
      return this.cachedXcmFees[assetId];
    }
  }

  private async refreshCachedXcmTransactionFeeToAssethub() {
    logger.info("HydrationRouter: Refreshing cached XCM transaction fees..");
    const placeholderSenderAddress = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
    const placeholderReceiverAddress = "5DqTNJsGp6UayR5iHAZvH4zquY6ni6j35ZXLtJA6bXwsfixg";

    for (const assetId of CACHED_ASSET_IDS) {
      const tx = Builder()
        .from("Hydration")
        .to("AssetHubPolkadot")
        .address(placeholderReceiverAddress)
        .senderAddress(placeholderSenderAddress)
        .currency({
          amount: "10000000",
          id: assetId
        });

      const info = await tx.getXcmFeeEstimate();

      const destinationAmountRaw = info.destination.fee.toString();
      // The destination fee is always in AssetHub DOT which has 10 decimals
      const destinationAmountDecimals = multiplyByPowerOfTen(destinationAmountRaw, -10).toString();

      const originAmountRaw = info.origin.fee.toString();
      // The origin fee is always in HDX which has 12 decimals
      const originAmountDecimals = multiplyByPowerOfTen(originAmountRaw, -12).toString();

      this.cachedXcmFees[assetId] = {
        destination: {
          amount: destinationAmountDecimals,
          amountRaw: destinationAmountRaw,
          currency: info.destination.currency
        },
        origin: {
          amount: originAmountDecimals,
          amountRaw: originAmountRaw,
          currency: info.origin.currency
        }
      };
    }
    logger.info("HydrationRouter: Done refreshing cached XCM transaction fees.");
  }
}

const hydrationRouter = new HydrationRouter();
export default hydrationRouter;
