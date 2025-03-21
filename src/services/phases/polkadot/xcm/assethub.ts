import { ApiPromise } from '@polkadot/api';
import { u8aToHex } from '@polkadot/util';
import { decodeAddress } from '@polkadot/util-crypto';
import Big from 'big.js';

import { ExecutionContext, OfframpingState } from '../../../offrampingFlow';
import { waitUntilTrue } from '../../../../helpers/function';
import { getRawInputBalance } from '../ephemeral';
import {
  signAndSubmitXcm,
  TransactionInclusionError,
  TransactionTemporarilyBannedError,
  verifyXcmSentEvent,
} from '../xcm';
import { storageService } from '../../../storage/local';
import { storageKeys, TransactionSubmissionIndices } from '../../../../constants/localStorage';

function createAssethubAssetTransfer(assethubApi: ApiPromise, receiverAddress: string, rawAmount: string) {
  const receiverId = u8aToHex(decodeAddress(receiverAddress));

  const destination = { V2: { parents: 1, interior: { X1: { Parachain: 2094 } } } };
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

  return assethubApi.tx.polkadotXcm.limitedReserveTransferAssets(
    destination,
    beneficiary,
    assets,
    feeAssetItem,
    weightLimit,
  );
}

export async function executeAssetHubToPendulumXCM(
  state: OfframpingState,
  context: ExecutionContext,
): Promise<OfframpingState> {
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
    const lastTxSubmissionIndex = Number(storageService.get(storageKeys.LAST_TRANSACTION_SUBMISSION_INDEX, '-1'));

    if (
      assetHubXcmTransactionHash === undefined &&
      lastTxSubmissionIndex === TransactionSubmissionIndices.ASSETHUB_XCM - 1
    ) {
      const tx = createAssethubAssetTransfer(assetHubNode.api, pendulumEphemeralAddress, inputAmount.raw);
      context.setOfframpSigningPhase('started');

      const afterSignCallback = () => setOfframpSigningPhase?.('finished');
      try {
        storageService.set(storageKeys.LAST_TRANSACTION_SUBMISSION_INDEX, TransactionSubmissionIndices.ASSETHUB_XCM);
        const { hash } = await signAndSubmitXcm(walletAccount, tx, afterSignCallback);
        return { ...state, assetHubXcmTransactionHash: hash as `0x${string}` };
      } catch (error) {
        if (error instanceof TransactionInclusionError) {
          try {
            const { hash } = await verifyXcmSentEvent(assetHubNode.api, error.blockHash, walletAccount.address);
            return { ...state, assetHubXcmTransactionHash: hash as `0x${string}` };
          } catch (err) {
            const error = err as Error;
            console.error('Error while verifying XcmSent event, this is unrecoverable:', error);
            return {
              ...state,
              failure: { type: 'unrecoverable', message: 'Error signing and submitting XCM. ' + (error || '') },
            };
          }
        } else if (error instanceof TransactionTemporarilyBannedError) {
          console.log('Transaction temporarily banned. Waiting for tokens to arrive on Pendulum.');
          // Do nothing but wait until tokens arrive on Pendulum
        } else {
          return {
            ...state,
            failure: { type: 'unrecoverable', message: 'Error signing and submitting XCM. ' + (error || '') },
          };
        }
      }
    }

    await waitUntilTrue(didInputTokenArrivedOnPendulum, 1000);
  }

  return { ...state, phase: 'subsidizePreSwap' };
}
