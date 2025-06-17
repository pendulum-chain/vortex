import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";

import { SubmittableExtrinsic } from "@polkadot/api-base/types";
import { ISubmittableResult } from "@polkadot/types/types";
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

  const destination = { V3: { parents: 1, interior: { X1: { Parachain: 2094 } } } };
  const beneficiary = {
    V3: { parents: 0, interior: { X1: { AccountId32: { network: undefined, id: receiverAccountHex } } } }
  };
  const assets = {
    V3: [
      {
        id: {
          Concrete: {
            parents: 0,
            interior: { X2: [{ PalletInstance: 110 }, { AccountKey20: { network: undefined, key: assetAccountKey } }] }
          }
        },
        fun: { Fungible: rawAmount }
      }
    ]
  };
  const feeAssetItem = 0;
  const weightLimit = "Unlimited";

  const xcm = moonbeamNode.api.tx.polkadotXcm.transferAssets(destination, beneficiary, assets, feeAssetItem, weightLimit);

  return xcm;
}
