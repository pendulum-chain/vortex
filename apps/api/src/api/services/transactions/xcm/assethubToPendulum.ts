import { SubmittableExtrinsic } from "@polkadot/api-base/types";
import { ISubmittableResult } from "@polkadot/types/types";
import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";
import { ApiManager } from "../../pendulum/apiManager";

type AssethubAssetKey = keyof typeof AssethubAsset;
// This is a mapping of assethub asset keys to their respective indices used on the assethub network.
const AssethubAsset = {
  usdc: 1337
};

export async function createAssethubToPendulumXCM(
  destinationAddress: string,
  assetKey: AssethubAssetKey,
  rawAmount: string
): Promise<SubmittableExtrinsic<"promise", ISubmittableResult>> {
  const apiManager = ApiManager.getInstance();
  const networkName = "assethub";
  const assethubNode = await apiManager.getApi(networkName);

  const { api: assethubApi } = assethubNode;

  const receiverId = u8aToHex(decodeAddress(destinationAddress));
  const assetIndex = AssethubAsset[assetKey];

  const destination = { V3: { interior: { X1: { Parachain: 2094 } }, parents: 1 } };
  const beneficiary = { V3: { interior: { X1: { AccountId32: { id: receiverId, network: undefined } } }, parents: 0 } };
  const assets = {
    V3: [
      {
        fun: { Fungible: rawAmount },
        id: {
          Concrete: { interior: { X2: [{ PalletInstance: 50 }, { GeneralIndex: assetIndex }] }, parents: 0 }
        }
      }
    ]
  };
  const feeAssetItem = 0;
  const weightLimit = "Unlimited";

  return assethubApi.tx.polkadotXcm.limitedReserveTransferAssets(destination, beneficiary, assets, feeAssetItem, weightLimit);
}
