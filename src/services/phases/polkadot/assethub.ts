import { ApiPromise } from '@polkadot/api';
import { Signer } from '@polkadot/types/types';
import { u8aToHex } from '@polkadot/util';
import { decodeAddress } from '@polkadot/util-crypto';
import Big from 'big.js';

import { ExecutionContext, OfframpingState } from '../../offrampingFlow';
import { waitUntilTrue } from '../../../helpers/function';
import { getRawInputBalance } from './ephemeral';
import { EventListener } from './eventListener';

export function createAssethubAssetTransfer(assethubApi: ApiPromise, receiverAddress: string, rawAmount: string) {
  const receiverId = u8aToHex(decodeAddress(receiverAddress));

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

export async function executeAssetHubXCM(state: OfframpingState, context: ExecutionContext): Promise<OfframpingState> {
  const { assetHubNode, walletAccount, setOfframpSigningPhase } = context;
  const { pendulumEphemeralAddress } = state;

  // We wait for up to 1 minute. XCM event should appear on the same block.
  const maxWaitingTimeMinutes = 1;
  const maxWaitingTimeMs = maxWaitingTimeMinutes * 60 * 1000;

  if (!walletAccount) {
    throw new Error('Wallet account not available');
  }
  if (!assetHubNode) {
    throw new Error('AssetHub node not available');
  }

  setOfframpSigningPhase?.('started');

  const didInputTokenArrivedOnPendulum = async () => {
    const inputBalanceRaw = await getRawInputBalance(state, context);
    return inputBalanceRaw.gt(Big(0));
  };

  if (!(await didInputTokenArrivedOnPendulum())) {
    const { assetHubXcmTransactionHash, inputAmount } = state;

    if (assetHubXcmTransactionHash === undefined) {
      const tx = createAssethubAssetTransfer(assetHubNode.api, pendulumEphemeralAddress, inputAmount.raw);
      context.setOfframpSigningPhase('started');

      const eventListener = EventListener.getEventListener(assetHubNode.api);
      const xcmSentEventPromise = eventListener.waitForXcmSentEvent(walletAccount.address, maxWaitingTimeMs);

      const { hash } = await tx.signAndSend(walletAccount.address, { signer: walletAccount.signer as Signer });
      setOfframpSigningPhase?.('finished');

      await xcmSentEventPromise;
      eventListener.unsubscribe();

      return { ...state, assetHubXcmTransactionHash: hash.toString() };
    }

    await waitUntilTrue(didInputTokenArrivedOnPendulum, 1000);
  }

  return { ...state, phase: 'subsidizePreSwap' };
}
