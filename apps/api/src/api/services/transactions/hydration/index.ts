import { ApiManager } from "@packages/shared";
import hydrationRouter from "../../hydration/swap";
import "@galacticcouncil/api-augment/hydradx"; // Import to augment types

/// Builds the necessary transactions to swap on Hydration and do an XCM transfers to AssetHub
/// while paying with the assets that are available in transit.
export async function buildHydrationSwapTransaction(
  assetIn: string,
  assetOut: string,
  amountIn: string,
  beneficiaryAddress: string
) {
  const { api } = await ApiManager.getInstance().getApi("hydration");

  const trade = await hydrationRouter.getBestSellPriceFor(assetIn, assetOut, amountIn);
  const swapTx = await hydrationRouter.createTransactionForTrade(trade, beneficiaryAddress);

  // Pay the tx fee in the output asset of the swap
  const changeFeeCurrencyTx = api.tx.multiTransactionPayment.setCurrency(assetOut);

  return api.tx.utility.batchAll([swapTx.get(), changeFeeCurrencyTx]);
}

/// Builds the necessary transaction to do an XCM transfer from Hydration to AssetHub
/// while paying the fee in the asset being transferred.
export async function buildHydrationToAssetHubTransfer(
  receiverAddress: string,
  rawAmount: string,
  hydrationAssetId: string,
  assethubAssetIndex: string
) {
  const { api } = await ApiManager.getInstance().getApi("hydration");

  // Pay the tx fee in the asset
  const changeFeeCurrencyTx = api.tx.multiTransactionPayment.setCurrency(hydrationAssetId);

  const dest = { V3: { interior: { X1: { Parachain: 1000 } }, parents: 1 } };
  const beneficiary = { V3: { interior: { X1: { AccountId32: { id: receiverAddress, network: null } } }, parents: 0 } };
  const assets = {
    V3: [
      {
        fun: { Fungible: rawAmount },
        id: {
          Concrete: { interior: { X3: { GeneralIndex: assethubAssetIndex, PalletInstance: 50, Parachain: 1000 } }, parents: 0 }
        }
      }
    ]
  };

  const xcmTransferTx = api.tx.polkadotXcm.transferAssets(dest, beneficiary, assets, 0, "Unlimited");

  return api.tx.utility.batchAll([xcmTransferTx, changeFeeCurrencyTx]);
}
