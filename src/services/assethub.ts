import { ApiPromise, Keyring, WsProvider } from '@polkadot/api';
import Big from 'big.js';

import { OfframpingState } from './offrampingFlow';
import { getApiManagerInstance } from './polkadot/polkadotApi';
import { waitUntilTrue } from '../helpers/function';
import { getRawInputBalance } from './polkadot/ephemeral';

function createAssethubApi() {
  const assethubWsUrl = 'wss://polkadot-asset-hub-rpc.polkadot.io';
  const assethubWsProvider = new WsProvider(assethubWsUrl);
  return ApiPromise.create({
    provider: assethubWsProvider,
  });
}

function createAssethubAssetTransfer(assethubApi: ApiPromise, receiverId: string, rawAmount: string) {
  const dest = { V2: { parents: 1, interior: { X1: { Parachain: 2094 } } } };
  const beneficiary = { V2: { parents: 0, interior: { X1: { AccountId32: { network: undefined, id: receiverId } } } } };
  const assets = {
    V2: [
      {
        id: {
          Concrete: { parents: 0, interior: { X2: [{ PalletInstance: 50 }, { GeneralIndex: 1337 }] } },
        },
        fun: { Fungible: rawAmount },
      },
    ],
  };
  const feeAssetItem = 0;
  const weightLimit = 'Unlimited';

  return assethubApi.tx.polkadotXcm.limitedReserveTransferAssets(dest, beneficiary, assets, feeAssetItem, weightLimit);
}

export async function executeAssethubXCM(state: OfframpingState): Promise<OfframpingState> {
  const pendulumApiComponents = await getApiManagerInstance();
  const apiData = pendulumApiComponents.apiData!;

  const didInputTokenArrivedOnPendulum = async () => {
    const inputBalanceRaw = await getRawInputBalance(state);
    return inputBalanceRaw.gt(Big(0));
  };

  if (!(await didInputTokenArrivedOnPendulum())) {
    let { assethubXcmTransactionHash, inputAmount } = state;

    if (assethubXcmTransactionHash === undefined) {
      const assethubApi = await createAssethubApi();

      const keyring = new Keyring({ type: 'sr25519', ss58Format: apiData.ss58Format });
      const ephemeralKeypair = keyring.addFromUri(state.pendulumEphemeralSeed);

      const tx = createAssethubAssetTransfer(assethubApi, ephemeralKeypair.address, inputAmount.raw);

      // TODO - Use account from external wallet for signing
      const { hash } = await tx.signAndSend(ephemeralKeypair);
      return { ...state, assethubXcmTransactionHash: hash.toString() };
    }

    await waitUntilTrue(didInputTokenArrivedOnPendulum, 20000);
  }

  return { ...state, phase: 'subsidizePreSwap' };
}
