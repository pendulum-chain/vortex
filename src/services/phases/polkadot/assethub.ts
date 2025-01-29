import { ApiPromise } from '@polkadot/api';
import { ISubmittableResult, Signer } from '@polkadot/types/types';
import { u8aToHex } from '@polkadot/util';
import { decodeAddress } from '@polkadot/util-crypto';
import Big from 'big.js';

import { ExecutionContext, OfframpingState } from '../../offrampingFlow';
import { waitUntilTrue } from '../../../helpers/function';
import { getRawInputBalance } from './ephemeral';
import { SubmittableExtrinsic } from '@polkadot/api-base/types';
import { parseEventXcmSent, XcmSentEvent } from './eventParsers';
import { WalletAccount } from '@talismn/connect-wallets';

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

  if (!walletAccount) {
    throw new Error('Wallet account not available');
  }
  if (!assetHubNode) {
    throw new Error('AssetHub node not available');
  }

  const didInputTokenArrivedOnPendulum = async () => {
    const inputBalanceRaw = await getRawInputBalance(state, context);
    return inputBalanceRaw.gt(Big(0));
  };

  if (!(await didInputTokenArrivedOnPendulum())) {
    const { assetHubXcmTransactionHash, inputAmount } = state;

    if (assetHubXcmTransactionHash === undefined) {
      const tx = createAssethubAssetTransfer(assetHubNode.api, pendulumEphemeralAddress, inputAmount.raw);
      context.setOfframpSigningPhase('started');

      const afterSignCallback = () => setOfframpSigningPhase?.('finished');
      const { hash } = await submitXcm(walletAccount, tx, afterSignCallback);

      return { ...state, assetHubXcmTransactionHash: hash.toString() };
    }

    await waitUntilTrue(didInputTokenArrivedOnPendulum, 1000);
  }

  return { ...state, phase: 'subsidizePreSwap' };
}

const submitXcm = async (
  walletAccount: WalletAccount,
  extrinsic: SubmittableExtrinsic<'promise'>,
  afterSignCallback: () => void,
): Promise<{ event: XcmSentEvent; hash: string }> => {
  return new Promise((resolve, reject) => {
    extrinsic
      .signAndSend(
        walletAccount.address,
        { signer: walletAccount.signer as Signer },
        (submissionResult: ISubmittableResult) => {
          const { status, events, dispatchError } = submissionResult;
          afterSignCallback();

          if (status.isFinalized) {
            const hash = status.asFinalized.toString();

            // Try to find a 'system.ExtrinsicFailed' event
            if (dispatchError) {
              reject('Xcm transaction failed');
            }

            // Try to find 'polkadotXcm.Sent' events
            const xcmSentEvents = events.filter((record) => {
              return record.event.section === 'polkadotXcm' && record.event.method === 'Sent';
            });

            const event = xcmSentEvents
              .map((event) => parseEventXcmSent(event))
              .filter((event) => {
                return event.originAddress == walletAccount.address;
              });

            if (event.length == 0) {
              reject(new Error(`No XcmSent event found for account ${walletAccount.address}`));
            }
            resolve({ event: event[0], hash });
          }
        },
      )
      .catch((error) => {
        afterSignCallback();
        reject(new Error(`Failed to request redeem: ${error}`));
      });
  });
};
