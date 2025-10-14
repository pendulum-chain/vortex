import { ApiManager } from "@packages/shared";
import hydrationRouter from "../../hydration/swap";
import "@galacticcouncil/api-augment/hydradx";
import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto"; // Import to augment types

/// Builds the necessary transactions to swap on Hydration and do an XCM transfers to AssetHub
/// while paying with the assets that are available in transit.
export async function buildHydrationSwapTransaction(
  assetIn: string,
  assetOut: string,
  amountIn: string,
  beneficiaryAddress: string,
  slippagePercent?: number
) {
  const { api } = await ApiManager.getInstance().getApi("hydration");

  await hydrationRouter.ready();
  const trade = await hydrationRouter.getBestSellPriceFor(assetIn, assetOut, amountIn);
  const swapTx = await hydrationRouter.createTransactionForTrade(trade, beneficiaryAddress, slippagePercent);

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
  assethubAssetIndex: number | "native"
) {
  const { api } = await ApiManager.getInstance().getApi("hydration");

  const receiverId = u8aToHex(decodeAddress(receiverAddress));

  const concreteAsset =
    assethubAssetIndex === "native"
      ? { interior: "Here", parents: 1 }
      : { interior: { X3: [{ Parachain: 1000 }, { PalletInstance: 50 }, { GeneralIndex: assethubAssetIndex }] }, parents: 1 };

  // Pay the tx fee in the asset
  const changeFeeCurrencyTx = api.tx.multiTransactionPayment.setCurrency(hydrationAssetId);

  const dest = { V3: { interior: { X1: { Parachain: 1000 } }, parents: 1 } };
  const beneficiary = { V3: { interior: { X1: { AccountId32: { id: receiverId, network: null } } }, parents: 0 } };
  const assets = {
    V3: [
      {
        fun: { Fungible: rawAmount },
        id: {
          Concrete: concreteAsset
        }
      }
    ]
  };

  const xcmTransferTx = api.tx.polkadotXcm.transferAssets(dest, beneficiary, assets, 0, "Unlimited");

  return api.tx.utility.batchAll([changeFeeCurrencyTx, xcmTransferTx]);
}
