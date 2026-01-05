import { SubmittableExtrinsic } from "@polkadot/api/submittable/types";
import { ISubmittableResult } from "@polkadot/types/types";
import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";
import { ApiManager, PendulumCurrencyId } from "../../index";
import "@pendulum-chain/types"; // Import to augment the api types

export async function createPendulumToHydrationTransfer(
  destinationAddress: string,
  currencyId: PendulumCurrencyId,
  rawAmount: string
): Promise<SubmittableExtrinsic<"promise", ISubmittableResult>> {
  const receiverId = u8aToHex(decodeAddress(destinationAddress));

  const destination = {
    V3: {
      interior: {
        X2: [{ Parachain: 2034 }, { AccountId32: { id: receiverId, network: undefined } }]
      },
      parents: 1
    }
  };

  const apiManager = ApiManager.getInstance();
  const networkName = "pendulum";
  const pendulumNode = await apiManager.getApi(networkName);

  const { api: pendulumApi } = pendulumNode;

  return pendulumApi.tx.xTokens.transfer(currencyId, rawAmount, destination, "Unlimited");
}
