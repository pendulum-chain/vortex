import { getAccount } from '@wagmi/core';
import { ApiPromise, Keyring } from '@polkadot/api';
import { Extrinsic } from '@pendulum-chain/api-solang';
import { Keypair } from 'stellar-sdk';

import { Networks } from '../../contexts/network';

import { ExecutionContext, OfframpingState } from '../offrampingFlow';
import { fetchSigningServiceAccountId } from '../signingService';
import { storeDataInBackend } from '../storage/remote';

import { prepareNablaApproveTransaction, prepareNablaSwapTransaction } from './nabla';
import { setUpAccountAndOperations, stellarCreateEphemeral } from './stellar';
import { prepareSpacewalkRedeemTransaction } from './polkadot';

export function encodeSubmittableExtrinsic(extrinsic: Extrinsic) {
  return extrinsic.toHex();
}

export function decodeSubmittableExtrinsic(encodedExtrinsic: string, api: ApiPromise) {
  return api.tx(encodedExtrinsic);
}

// Creates and signs all required transactions already so they are ready to be submitted.
// The transactions are stored in the state and the phase is updated to 'squidRouter'.
// The transactions are also dumped to a Google Spreadsheet.
export async function prepareTransactions(state: OfframpingState, context: ExecutionContext): Promise<OfframpingState> {
  const {
    stellarEphemeralSecret,
    pendulumEphemeralSeed,
    outputTokenType,
    sepResult,
    inputAmount,
    outputAmount,
    inputTokenType,
    squidRouterReceiverId,
    squidRouterReceiverHash,
  } = state;

  const { pendulumNode } = context;

  const spacewalkRedeemTransaction = await prepareSpacewalkRedeemTransaction(state, context);
  const nablaApproveTransaction = await prepareNablaApproveTransaction(state, context);
  const nablaSwapTransaction = await prepareNablaSwapTransaction(state, context);

  // Fund Stellar ephemeral only after all other transactions are prepared
  await stellarCreateEphemeral(stellarEphemeralSecret, outputTokenType);
  const stellarFundingAccountId = (await fetchSigningServiceAccountId()).stellar.public;
  const stellarEphemeralKeypair = Keypair.fromSecret(stellarEphemeralSecret);
  const stellarEphemeralPublicKey = stellarEphemeralKeypair.publicKey();

  const { offrampingTransaction, mergeAccountTransaction } = await setUpAccountAndOperations(
    stellarFundingAccountId,
    stellarEphemeralKeypair,
    sepResult,
    outputTokenType,
  );

  const transactions = {
    stellarOfframpingTransaction: offrampingTransaction.toEnvelope().toXDR().toString('base64'),
    stellarCleanupTransaction: mergeAccountTransaction.toEnvelope().toXDR().toString('base64'),
    spacewalkRedeemTransaction: encodeSubmittableExtrinsic(spacewalkRedeemTransaction),
    nablaSwapTransaction: encodeSubmittableExtrinsic(nablaSwapTransaction),
    nablaApproveTransaction: encodeSubmittableExtrinsic(nablaApproveTransaction),
  };

  const { ss58Format } = pendulumNode;
  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const pendulumEphemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);
  const pendulumEphemeralPublicKey = pendulumEphemeralKeypair.address;

  // Try to store the data in the backend
  try {
    const data = {
      timestamp: new Date().toISOString(),
      offramperAddress: state.offramperAddress,
      stellarEphemeralPublicKey,
      pendulumEphemeralPublicKey,
      nablaApprovalTx: transactions.nablaApproveTransaction,
      nablaSwapTx: transactions.nablaSwapTransaction,
      spacewalkRedeemTx: transactions.spacewalkRedeemTransaction,
      stellarOfframpTx: transactions.stellarOfframpingTransaction,
      stellarCleanupTx: transactions.stellarCleanupTransaction,
      inputAmount: inputAmount.raw.toString(),
      inputTokenType,
      outputAmount: outputAmount.raw.toString(),
      outputTokenType,
      squidRouterReceiverId,
      squidRouterReceiverHash,
    };
    await storeDataInBackend(data);
  } catch (error) {
    console.error('Error storing data', error);
  }

  return {
    ...state,
    transactions,
    phase: state.network === Networks.AssetHub ? 'pendulumFundEphemeral' : 'squidRouter',
  };
}
