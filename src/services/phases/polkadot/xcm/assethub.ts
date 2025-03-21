import { ApiPromise, Keyring } from '@polkadot/api';
import { u8aToHex } from '@polkadot/util';
import { decodeAddress } from '@polkadot/util-crypto';
import Big from 'big.js';

import { isOfframpState, OfframpingState } from '../../../offrampingFlow';
import { ExecutionContext, FlowState } from '../../../flowCommons';
import { waitUntilTrue } from '../../../../helpers/function';
import { getRawInputBalance } from '../ephemeral';
import { signAndSubmitXcm, TransactionInclusionError, verifyXcmSentEvent } from '../xcm';
import { storageService } from '../../../storage/local';
import { storageKeys, TransactionSubmissionIndices } from '../../../../constants/localStorage';
import { ApiComponents } from '../../../../contexts/polkadotNode';
import { SignerOptions, SubmittableExtrinsic } from '@polkadot/api-base/types';
import { ISubmittableResult } from '@polkadot/types/types';
import { PendulumCurrencyId, PendulumStellarCurrencyId } from '../../../../constants/tokenConfig';

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

export function createPendulumToAssethubTransfer(
  pendulumNode: ApiComponents,
  destinationAddress: string,
  currencyId: PendulumCurrencyId,
  rawAmount: string,
  pendulumEphemeralSeed: string,
  nonce = -1,
): Promise<SubmittableExtrinsic<'promise', ISubmittableResult>> {
  const destination = {
    V3: {
      parents: 1,
      interior: { X2: [{ Parachain: 1000 }, { AccountKey20: { network: undefined, key: destinationAddress } }] },
    },
  };
  const { ss58Format, api: pendulumApi } = pendulumNode;

  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const ephemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);

  const options: Partial<SignerOptions> = { nonce };
  options.era = 0;
  return pendulumApi.tx.xTokens
    .transfer(currencyId, rawAmount, destination, 'Unlimited')
    .signAsync(ephemeralKeypair, options);
}

export async function executeAssetHubToPendulumXCM(state: FlowState, context: ExecutionContext): Promise<FlowState> {
  if (!isOfframpState(state)) {
    throw new Error('executeAssetHubToPendulumXCM: State must be an offramp state');
  }
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
        const { hash } = await signAndSubmitXcm(walletAccount, tx, afterSignCallback);
        storageService.set(storageKeys.LAST_TRANSACTION_SUBMISSION_INDEX, TransactionSubmissionIndices.ASSETHUB_XCM);
        return { ...state, assetHubXcmTransactionHash: hash as `0x${string}` };
      } catch (error) {
        if (error instanceof TransactionInclusionError) {
          try {
            const { hash } = await verifyXcmSentEvent(assetHubNode.api, error.blockHash, walletAccount.address);
            return { ...state, assetHubXcmTransactionHash: hash as `0x${string}` };
          } catch (err) {
            const error = err as Error;
            console.error('Error while verifying XcmSent event, this is unrecoverable:', error.message);
            return { ...state, failure: { type: 'unrecoverable', message: 'Error signing and submitting XCM' } };
          }
        }
        return { ...state, failure: { type: 'unrecoverable', message: 'Error signing and submitting XCM' } };
      }
    }

    await waitUntilTrue(didInputTokenArrivedOnPendulum, 1000);
  }

  return { ...state, phase: 'subsidizePreSwap' };
}
