import { ApiPromise, Keyring } from '@polkadot/api';
import { Extrinsic } from '@pendulum-chain/api-solang';

import { storeDataInBackend } from '../storage/remote';

import { prepareNablaApproveTransaction, prepareNablaSwapTransaction } from './nabla';
import { createPendulumToMoonbeamTransfer } from './polkadot/xcm/moonbeam';
import { getOutputTokenDetailsMoonbeam, getPendulumDetails } from '../../constants/tokenConfig';
import { ExecutionContext } from '../flowCommons';
import { BrlaOnrampingState, BrlaOnrampTransactions } from '../onrampingFlow';
import { createMoonbeamToPendulumXCM } from './moonbeam';
import { createPendulumToAssethubTransfer } from './polkadot/xcm/assethub';
import { createOnrampSquidrouterTransaction, OnrampSquidrouterParams } from './squidrouter/createTransaction';

export function encodeSubmittableExtrinsic(extrinsic: Extrinsic) {
  return extrinsic.toHex();
}

export function decodeSubmittableExtrinsic(encodedExtrinsic: string, api: ApiPromise) {
  return api.tx(encodedExtrinsic);
}

// Creates and signs all required transactions already so they are ready to be submitted.
// The transactions are also dumped to a Google Spreadsheet.
export async function prepareOnrampTransactions(
  state: BrlaOnrampingState,
  context: ExecutionContext,
): Promise<BrlaOnrampingState> {
  const { pendulumEphemeralSeed, outputTokenType, inputAmount, outputAmount, inputTokenType, flowType } = state;

  const { pendulumNode, moonbeamNode } = context;

  let transactions: BrlaOnrampTransactions | undefined = undefined;

  const { ss58Format } = pendulumNode;
  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const pendulumEphemeralKeypair = keyring.addFromUri(pendulumEphemeralSeed);
  const pendulumEphemeralPublicKey = pendulumEphemeralKeypair.address;

  const dataCommon = {
    flowType,
    timestamp: new Date().toISOString(),
    pendulumEphemeralPublicKey,
    inputAmount: inputAmount.raw.toString(),
    inputTokenType,
    outputAmount: outputAmount.raw.toString(),
    outputTokenType,
  };

  try {
    transactions = await prepareBrlaOnrampTransactions(state, context);

    const data = {
      ...dataCommon,
      nablaApprovalTx: transactions.nablaApproveTransaction,
      nablaSwapTx: transactions.nablaSwapTransaction,
      moonbeamToPendulumXcmTx: transactions.moonbeamToPendulumXcmTransaction,
      pendulumToMoonbeamXcmTx: transactions.pendulumToMoonbeamXcmTransaction,
      squidrouterApproveTx: transactions.squidrouterApproveTransaction,
      squidrouterSwapTx: transactions.squidrouterSwapTransaction,
      pendulumToAssetHubXcmTx: transactions.pendulumToAssetHubXcmTransaction,
    };
    //await storeDataInBackend(data);
  } catch (err) {
    const error = err as Error;
    console.log(error);
    return { ...state, failure: { type: 'unrecoverable', message: error.message } };
  }

  return {
    ...state,
    transactions,
    phase: 'createPayInRequest',
  };
}

async function prepareBrlaOnrampTransactions(
  state: BrlaOnrampingState,
  context: ExecutionContext,
): Promise<BrlaOnrampTransactions> {
  const {
    moonbeamEphemeralSeed,
    moonbeamEphemeralAddress,
    pendulumEphemeralSeed,
    pendulumEphemeralAddress,
    addressDestination,
    inputAmount,
    outputAmount,
    inputTokenType,
    outputTokenType,
    nablaSwapNonce,
    toNetwork,
  } = state;

  const { moonbeamNode, pendulumNode } = context;

  const inputTokenAddressMoonbeam = getOutputTokenDetailsMoonbeam(inputTokenType).moonbeamErc20Address;
  const outputTokenDetails = getPendulumDetails(toNetwork, outputTokenType)!;

  // Improvement: Nabla could be moved to a transaction commons, also with offramp.
  const nablaApproveTransaction = await prepareNablaApproveTransaction(state, context);
  const nablaSwapTransaction = await prepareNablaSwapTransaction(state, context);
  console.log('Nabla transactions prepared');

  const moonbeamToPendulumXCMTransaction = await createMoonbeamToPendulumXCM(
    moonbeamNode.api,
    pendulumEphemeralAddress,
    inputAmount.raw.toString(),
    inputTokenAddressMoonbeam,
    moonbeamEphemeralSeed,
  );
  console.log('destination address: ', addressDestination);
  console.log(
    'Moonbeam to Pendulum XCM transaction prepared: ',
    encodeSubmittableExtrinsic(moonbeamToPendulumXCMTransaction),
  );
  // Second and third transactions of moonbeam's fresh account are Squidrouter transactions

  // Will be it's second transaction, after Moonbeam to Pendulum XCM
  const moonbeamEphemeralStartingNonce = 1;
  const { squidrouterApproveTransaction, squidrouterSwapTransaction } = await createOnrampSquidrouterTransaction({
    fromAddress: moonbeamEphemeralAddress,
    amount: outputAmount.raw.toString(),
    outputToken: outputTokenType,
    toNetwork: toNetwork,
    addressDestination,
    moonbeamEphemeralSeed: moonbeamEphemeralSeed as `0x${string}`,
    moonbeamEphemeralStartingNonce,
  });
  console.log('Squid transactions prepared: ', squidrouterApproveTransaction, squidrouterSwapTransaction);
  const pendulumToMoonbeamNonce = nablaSwapNonce + 1;

  const pendulumToMoonbeamXcmTransaction = await createPendulumToMoonbeamTransfer(
    pendulumNode,
    moonbeamEphemeralAddress,
    outputAmount.raw,
    state.pendulumEphemeralSeed,
    outputTokenDetails.pendulumCurrencyId,
    pendulumToMoonbeamNonce,
  );
  console.log('Pendulum to Moonbeam XCM transaction prepared: ', pendulumToMoonbeamXcmTransaction);
  const pendulumToAssethubNonce = nablaSwapNonce + 1;

  const pendulumToAssetHubXcmTransaction = await createPendulumToAssethubTransfer(
    pendulumNode,
    addressDestination,
    outputTokenDetails.pendulumCurrencyId,
    outputAmount.raw,
    pendulumEphemeralSeed,
    pendulumToAssethubNonce + 1,
  );
  console.log('Pendulum to Assethub XCM transaction prepared: ', pendulumToAssetHubXcmTransaction);
  const transactions = {
    nablaApproveTransaction: encodeSubmittableExtrinsic(nablaApproveTransaction),
    nablaSwapTransaction: encodeSubmittableExtrinsic(nablaSwapTransaction),
    moonbeamToPendulumXcmTransaction: encodeSubmittableExtrinsic(moonbeamToPendulumXCMTransaction),
    pendulumToMoonbeamXcmTransaction: encodeSubmittableExtrinsic(pendulumToMoonbeamXcmTransaction),
    squidrouterApproveTransaction,
    squidrouterSwapTransaction,
    pendulumToAssetHubXcmTransaction: encodeSubmittableExtrinsic(pendulumToAssetHubXcmTransaction),
  };

  return transactions;
}
