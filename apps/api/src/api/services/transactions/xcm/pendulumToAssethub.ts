import { PendulumCurrencyId } from "@packages/shared";
import { SubmittableExtrinsic } from "@polkadot/api-base/types";
import { ISubmittableResult } from "@polkadot/types/types";
import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";
import { ApiManager } from "../../pendulum/apiManager";

export async function createPendulumToAssethubTransfer(
  destinationAddress: string,
  currencyId: PendulumCurrencyId,
  rawAmount: string
): Promise<SubmittableExtrinsic<"promise", ISubmittableResult>> {
  const receiverId = u8aToHex(decodeAddress(destinationAddress));
  const destination = {
    V3: {
      parents: 1,
      interior: {
        X2: [{ Parachain: 1000 }, { AccountId32: { network: undefined, id: receiverId } }]
      }
    }
  };

  const apiManager = ApiManager.getInstance();
  const networkName = "pendulum";
  const pendulumNode = await apiManager.getApi(networkName);

  const { api: pendulumApi } = pendulumNode;

  return pendulumApi.tx.xTokens.transfer(currencyId, rawAmount, destination, "Unlimited");
}
