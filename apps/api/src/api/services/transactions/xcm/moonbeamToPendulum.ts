import { SubmittableExtrinsic } from "@polkadot/api-base/types";
import { ISubmittableResult } from "@polkadot/types/types";
import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";
import { ApiManager } from "../../pendulum/apiManager";

export async function createMoonbeamToPendulumXCM(
  receiverAddress: string,
  rawAmount: string,
  assetAccountKey: string
): Promise<SubmittableExtrinsic<"promise", ISubmittableResult>> {
  const apiManager = ApiManager.getInstance();
  const networkName = "moonbeam";
  const moonbeamNode = await apiManager.getApi(networkName);

  const receiverAccountHex = u8aToHex(decodeAddress(receiverAddress));

  const destination = { V3: { interior: { X1: { Parachain: 2094 } }, parents: 1 } };
  const beneficiary = {
    V3: { interior: { X1: { AccountId32: { id: receiverAccountHex, network: undefined } } }, parents: 0 }
  };
  const assets = {
    V3: [
      {
        fun: { Fungible: rawAmount },
        id: {
          Concrete: {
            interior: { X2: [{ PalletInstance: 110 }, { AccountKey20: { key: assetAccountKey, network: undefined } }] },
            parents: 0
          }
        }
      }
    ]
  };
  const feeAssetItem = 0;
  const weightLimit = "Unlimited";

  const xcm = moonbeamNode.api.tx.polkadotXcm.transferAssets(destination, beneficiary, assets, feeAssetItem, weightLimit);

  return xcm;
}
